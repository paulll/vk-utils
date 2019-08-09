const Promise = require('bluebird');
const fs = require('fs').promises;
const redis = require('redis');
const path = require('path');
const {API} = require('@paulll/vklib');
const config = require('../config');

Object.defineProperty(Array.prototype, 'chunk', {
	value: function(chunkSize) {
		const R = [];
		for (let i = 0; i < this.length; i += chunkSize)
			R.push(this.slice(i, i + chunkSize));
		return R;
	}
});


Promise.promisifyAll(redis);
const client = redis.createClient(config.redis.port);

const scan = async (patt, chunk_handler) => {
	let cursor = '0';
	do {
		let resp = await client.scanAsync(cursor, 'MATCH', patt);
		cursor = resp[0];
		await chunk_handler(resp[1]);
	} while (cursor !== '0');
};


const getGroups = async (id) => {
	const result = [];
	await scan(`sim:gr:*`, async (groups) => {
		for (const gr of groups) {
			const joined = await client.sismemberAsync(gr, id);
			if (joined)
				result.push(+gr.slice(7));
		}
	});
	return result;
};


(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});


	const user = (await api.enqueue('users.get', {user_ids: process.argv.pop(),v: 5.92,  fields: 'counters,sex'}, {force_private: true}))[0];
	const counters = user.counters;

	let groups = [];
	if (!counters.hasOwnProperty('groups')) {
		console.log('Реверсный поиск групп.. пару минут');
		const groups_s = new Set(await getGroups(user.id));

		// объединяем с пабликами
		const publics = await api.fetch('groups.get', {user_id: user.id, extended: 1, v: 5.92, count: 1000}, {force_private: true, silent: false});
		const publicsById = new Map(publics.map(x => ([x.id, x.name])));
		const publicsList = publics.map(x => x.id);
		groups = Array.from(new Set([...groups_s, ...publicsList])).map(x => ({id: x, name: publicsList.get(x) || `id${x}` }));
	} else {
		groups = await api.fetch('groups.get', {user_id: user.id, extended: 1, v: 5.92, count: 1000}, {force_private: true, silent: false});
	}

	console.log('Группы определены.. Загрузка участников');
	let counter = 0;
	const proc = async (group) => {
		if (await client.existsAsync(`sim:gr:${group.id}`)) return ++counter;

		try {
			const size = (await api.enqueue('groups.getMembers', {v: 5.92, group_id: group.id, count: 1000}))
				.count;

			let members = [];
			if (size < config["similiar-users"]["group-size-threshold"]) {
				try {
					members = await api.fetch('groups.getMembers',
						{v: 5.92, group_id: group.id, count: 1000}, {limit: config["similiar-users"]["group-size-threshold"]});
					await client.saddAsync(`sim:gr:${group.id}`, members);
				} catch (e) {}
			}
			console.log(`[${++counter}/${groups.length}] Получена группа ${group.name}, участников: ${size >= config["similiar-users"]["group-size-threshold"] ? 'много': members.length }`);
		} catch (e) {
			console.log(`[${++counter}/${groups.length}] Не получена группа ${group.name}: ошибка доступа`);
		}
	};

	const items = groups.map ( x=>x.id);

	await Promise.all(Array(20).fill(0).map(async() => {
		while (groups.length)
			await proc(groups.pop());
	}));

	console.log('Участники получены..');

	const usersMap = new Map;
	const usersMapP = new Map;


	// Calc Average
	let total_group_size = 0;
	for (let group of items)
		total_group_size += await client.scardAsync(`sim:gr:${group}`);
	const k = total_group_size / items.length / 4;

	console.log('k =', k);

	for (let group of items) {
		// если многие из выборки входят в одну и ту же группу, придаем ей меньше внимания?
		// чем больше людей в группе, тем меньше её вес

		const members = await client.smembersAsync(`sim:gr:${group}`);
		console.log('analysis', group);
		for (let uid of members) {
			const oldValue = usersMap.get(+uid) || 0;
			const oldPValue = usersMapP.get(+uid) || 0;
			usersMap.set(+uid, oldValue + 1 + 1/Math.sqrt(members.length/k));
			usersMapP.set(+uid, oldPValue + 1);
		}
	}

	const members = Array.from(usersMap).sort((a,b) => b[1] > a[1]? 1:-1).slice(0,100);
	console.log('Получаем имена');
	const udata = await api.enqueue('users.get', {v:5.92, fields:'sex', user_ids: members.map(x=>x[0]).join(',')});

	console.log(members);

	for (let u of udata)
		console.log(`${u.first_name} ${u.last_name} ${u.sex===1?'ж':'м'} :: ${usersMap.get(u.id)}/${usersMapP.get(u.id)} :: id= ${u.id}`);

	process.exit(0);
})();


process
	.on('unhandledRejection', (reason, p) => {
		console.error(reason, 'Unhandled Rejection at Promise', p);
	})
	.on('uncaughtException', err => {
		console.error(err, 'Uncaught Exception thrown');
		process.exit(1);
	});