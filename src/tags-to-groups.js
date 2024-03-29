const fs = require('fs').promises;
const {API} = require('@paulll/vklib');
const path = require('path');
const config = require('../config');

let savedGroups;
try {
	savedGroups = new Map(require('../data/groups.json') || []);
} catch(e) {
	savedGroups = new Map;
}

(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const tags = (await fs.readFile(path.join(__dirname, '../data/tags.txt'), {encoding: 'utf8'}))
		.split('\n')
		.filter(x => x.length && !x.startsWith('#'));

	console.log(`[info] Всего тегов: ${tags.length}`);
	console.log(`[info] Ищем группы по заданным тегам`);

	let counter = 0;
	for (const tag of tags) {
		const groups = (await api.enqueue('groups.search', {v: 5.92, q: tag, count: config["tags-to-groups"]["max-groups-per-tag"]},
			{force_private: true})).items || [];
		if (savedGroups.has(tag))
			savedGroups.set(tag, [...new Set([...savedGroups.get(tag), ...groups])]);
		else
			savedGroups.set(tag, [...new Set(groups)]);
		if ((++counter % 5) === 0)
			console.log(`[progress] Загружено ${counter} тегов из ${tags.length}`)
	}

	const allGroups = [...new Set(Array.prototype.concat.apply([], [...savedGroups.values()]))];
	console.log(`[info] Всего групп: ${allGroups.length}`);

	await fs.writeFile(path.join(__dirname, '../data/groups.json'), JSON.stringify([...savedGroups.entries()]));
	console.log('[info] Сохранен groups.json');
})();

process
	.on('unhandledRejection', (reason, p) => {
		console.error(reason, 'Unhandled Rejection at Promise', p);
	})
	.on('uncaughtException', err => {
		console.error(err, 'Uncaught Exception thrown');
		process.exit(1);
	});