const Promise = require('bluebird');
const fs = require('fs').promises;
const {API} = require('@paulll/vklib');
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');

Promise.promisifyAll(redis);
const client = redis.createClient(16379);

const settings = {
	threshold: 150000
};

(async () => {
	const api = new API({
		access_token: '44c28c57316dc3839d67bb535772a1807227d57d94a64e6685ab1c1dae574db31a1a72a25f886e0b6f748',
		service_token: '590b7e5b590b7e5b590b7e5bea596a14f85590b590b7e5b039be32ce7e754aab89565f1'
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
		if (size < settings.threshold) {
			members = await api.fetch('groups.getMembers',
				{v: 5.92, group_id: group.id, count: 1000}, {limit: 250000});
			await client.saddAsync(`sim:gr:${group.id}`, members);
		}

		console.log(`[${counter}/${allGroups.length}] Получена группа ${group.name}, участников: ${size >= settings.threshold ? 'много': members.length }`);
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