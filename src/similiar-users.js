const Promise = require('bluebird');
const redis = require('redis');
const {API} = require('@paulll/vklib');
const config = require('../config');
const createGraph = require('ngraph.graph');

Promise.promisifyAll(redis);
const client = redis.createClient(config.redis.port);
const {getGroups} = require('./common/reverse-groups')(client);

require('./common/error-handler');

(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const apiForcePublic = new API({
		access_token: false,
		service_token: config.service_token
	});

	const fetchGroupMembers = require('./common/fetch-group-members')(api, client);

	//
	// Базовые данные о пользователе
	//
	const {counters, ...user} = (await api.enqueue('users.get', {user_ids: process.argv.pop(), v: 5.92, lang: 0, fields: 'counters,sex'}, {force_private: true}))[0];
	const publics = await api.fetch('groups.get', {user_id: user.id, extended: 1, v: 5.92, count: 1000}, {force_private: true, silent: false});

	//
	// Список групп реверсно
	//
	let groups = publics;
	if (!counters.hasOwnProperty('groups')) {
		console.log('Реверсный поиск групп.. пару минут');
		const groups_s = new Set(await getGroups(user.id));

		// объединяем с пабликами

		const publicsById = new Map(publics.map(x => ([x.id, x.name])));
		const publicsList = publics.map(x => x.id);
		groups = Array.from(new Set([...groups_s, ...publicsList]))
			.map(x => ({id: x, name: publicsById.get(x) || `id${x}` }));
	}

	//
	// Участники групп
	//
	console.log('Группы определены.. Загрузка участников');
	const items = groups.map ( x=>x.id);
	await fetchGroupMembers(groups, config["similiar-users"]["group-size-threshold"]);

	//
	// Анализ участников групп
	//
	const sum_group_weight_map = new Map;
	const group_intersections_count_map = new Map;

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
		for (let member_id of members) {
			const old_group_weight = sum_group_weight_map.get(+member_id) || 0;
			const old_group_ic = group_intersections_count_map.get(+member_id) || 0;
			sum_group_weight_map.set(+member_id, old_group_weight + 1 + 1/Math.sqrt(members.length/k));
			group_intersections_count_map.set(+member_id, old_group_ic + 1);
		}
	}

	const candidates_by_groups = Array.from(sum_group_weight_map).sort((a,b) => b[1] > a[1]? 1:-1).slice(0,100);

	//
	// Анализ графа друзей
	//
	console.log('Загружаем граф друзей');
	const g = createGraph();
	const source_friends = await api.fetch('friends.get', {user_id: user.id, v:5.92}, {limit: 5000});
	let total_friends_amount_1 = 0, total_friends_amount_2 = 0;
	await Promise.map(new Set([...candidates_by_groups.map(x=>x[0]), ...source_friends]), async (key) => {
		const friends = (await apiForcePublic.fetch('friends.get', {user_id: key, v:5.92}, {limit: 5000})) || [];
		total_friends_amount_1++;
		total_friends_amount_2 += friends.length;
		for (const friend of friends)
			g.addLink(key, friend);
	});

	console.log('Анализ графа друзей...');
	const friends_k = total_friends_amount_2 / total_friends_amount_1 / 4;
	const friend_intersections_amount_map = new Map;
	const sum_friend_weight_map = new Map;

	g.forEachLinkedNode(user.id, (friend_of_target) => {
		g.forEachLinkedNode(friend_of_target.id, (fof) => {
			friend_intersections_amount_map.set(+fof.id, (friend_intersections_amount_map.get(+fof.id)||0) + 1);
			sum_friend_weight_map.set(+fof.id, (friend_intersections_amount_map.get(+fof.id)||0) + 1/Math.sqrt(fof.links.length/friends_k));
		});
	});

	console.log('Пересортировка..');
	const members = candidates_by_groups.map(([key,value]) => {
		const intersections = sum_friend_weight_map.get(+key)||0;
		return [key, value + intersections];  //(intersections? 15 + 4*Math.sqrt(intersections) : 0)
	}).sort((a,b) => b[1] > a[1]? 1:-1);

	//
	// Вывод
	//
	console.log('Получаем имена..');
	const users_data = await api.enqueue('users.get', {v:5.92, fields:'sex', lang: 0, user_ids: members.map(x=>x[0]).join(',')});
	const users_map_final = new Map(members);

	for (let u of users_data)
		console.log(
			`${u.first_name} ${u.last_name} ${u.sex===1?'ж':'м'}  :: ` +
			`${users_map_final.get(u.id)}/${group_intersections_count_map.get(u.id)}/${friend_intersections_amount_map.get(u.id)||0} :: `+
			`id= ${u.id}`
		);

	process.exit(0);
})();


