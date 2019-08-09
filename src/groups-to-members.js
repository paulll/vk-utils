const Promise = require('bluebird');
const fs = require('fs').promises;
const {API} = require('@paulll/vklib');
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');
const config = require('../config');

Promise.promisifyAll(redis);
const client = redis.createClient(config.redis.port);

(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const tags = (await fs.readFile(path.join(__dirname, '../data/tags.txt'), {encoding: 'utf8'}))
		.split('\n')
		.filter(x => x.length && !x.startsWith('#'));

	const allGroups = [...new Set(Array.prototype.concat.apply([], [...tags.map(x => savedGroups.get(x))]))].filter(x=>x);
	console.log(`[info] Всего групп: ${allGroups.length}`);

	console.log('[info] Получаем содержимое групп');

	let counter = 0;

	const proc = async (group) => {
		++counter;
		if (await client.existsAsync(`sim:gr:${group.id}`)) return;

		const size = (await api.enqueue('groups.getMembers', {v: 5.92, group_id: group.id, count: 1000}))
			.count;

		let members = [];
		if (size < config["groups-to-members"]["group-size-threshold"]) {
			members = await api.fetch('groups.getMembers',
				{v: 5.92, group_id: group.id, count: 1000}, {limit: config["groups-to-members"]["group-size-threshold"]});
			await client.saddAsync(`sim:gr:${group.id}`, members);
		}

		console.log(`[${counter}/${allGroups.length}] Получена группа ${group.name}, участников: ${size >= config["groups-to-members"]["group-size-threshold"] ? 'много': members.length }`);
	};

	for (let i = 0 ; i < 20; ++i) {
		const next = async () => {
			await proc(allGroups.pop());
			setTimeout(next, 0);
		};
		if (allGroups.length)
			next();
	}

	console.log('[info] Списки участников получены');
})();

process
	.on('unhandledRejection', (reason, p) => {
		console.error(reason, 'Unhandled Rejection at Promise', p);
	})
	.on('uncaughtException', err => {
		console.error(err, 'Uncaught Exception thrown');
		process.exit(1);
	});