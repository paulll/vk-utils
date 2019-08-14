const Promise = require('bluebird');
const fs = require('fs').promises;
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');
const {API} = require('@paulll/vklib');
const pug = require('pug');
const config = require('../config');

const tpl = pug.compileFile(__dirname + '/report/template.pug');

require('./common/array-chunk');
require('./common/error-handler');

const fields = [
	"sex", "bdate", "city", "country", "photo_max", "photo_max_orig", "photo_50",
	"online", "domain", "has_mobile", "contacts", "education", "universities",
	"schools", "activity", "last_seen", "relation", "counters", "nickname", "relatives",
	"interests", "movies", "tv", "books", "games", "about", "connections", "career",
	"maiden_name", "military", "occupation", "personal", "quotes", "screen_name", "site", "home_town"
].join(',');

Promise.promisifyAll(redis);
const client = redis.createClient(config.redis.port);
const {getGroups} = require('./common/reverse-groups')(client);

(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const sections = (await fs.readFile(path.join(__dirname, '../data/tags.txt'), {encoding: 'utf8'}))
		.split('### ')
		.map(part => {
			const lines = part.split('\n');
			const nameAndWeight = lines[0].split(/\s+\|\s+/);
			const name = nameAndWeight[0].trim();
			const weight = +(nameAndWeight[1] || '').trim() || 1;
			const items = lines.slice(1).map(x => x.trim()).filter(x => x);
			const groups = Array.prototype.concat.apply([], items.map( x => savedGroups.get(x))).filter(x=>x);

			return {
				name,
				weight,
				items,
				groups
			}
		}).filter(x=>x.name);


	console.log('[info] Получаем топ-100к');
	const top = await client.zrevrangebyscoreAsync('tans', '+inf', '-inf', 'LIMIT', 0, 100000);
	//const top = [];

	let c = 0;
	console.log('[info] Загрузка информации по страницам');
	const filtered = []; //require('../result/filtered');
	for (const chunk of top.chunk(200)) {
		console.log(`${c += 200} / 10000`);

		const part = await api.enqueue('users.get', {user_ids: chunk.join(','), fields, v:5.92});

		for (let user of part) {
			if (user.sex !== 1) continue; // 1 - женский
			if (user.deactivated) continue;
			if (user.is_closed) continue;
			if (user.country && user.country.id !== 1) continue; // 1 - россия
			if (user.city && user.city !== 1) continue; // 1 - москва
			if (user.activity && user.activity.toLowerCase().includes('парни не пишите')
				|| user.activity && user.activity.toLowerCase().includes('парни, не пишите')
				|| user.activity && user.activity.toLowerCase().includes('я парень')) continue;

			// если указана дата рождения, то 1997 - 2002
			if (user.bdate && +user.bdate.split('.').pop() > 1000 && +user.bdate.split('.').pop() < 1997) continue;
			if (user.bdate && +user.bdate.split('.').pop() > 2002 ) continue;
			if (user.relation !== 0 && user.relation !== 1 && user.relation !== 6 ) continue; // не указано, не замужем или в активном поиске

			// todo: выяснять дату рождения отдельно
			// todo: учесть крупные группы
			// todo: сохранить данные юзеров локально


			console.log(user);


			const {counters} = (await api.enqueue('users.get', {user_ids: user.id,v: 5.92,  fields: 'counters'}, {force_private: true}))[0];
			if (!counters.hasOwnProperty('groups')) {
				console.log('Реверсный поиск групп.. пару минут');
				const groups = new Set(await getGroups(user.id));
				user.sections = new Map(sections.map(s => ([s.name, []])));

				for (let section of sections)
					for (let group of section.groups)
						if (groups.has(group.id))
							user.sections.get(section.name).push(group);
			} else {
				const groups = await api.fetch('groups.get', {user_id: user.id, extended: 1, v: 5.92, count: 1000}, {force_private: true, silent: false});
				const s_sections = new Map(sections.map(s => ([s.name, new Set])));

				for (let section of sections) {
					for (let tag of section.items)
						for (let group of groups)
							if (group.name.toLowerCase().includes(tag))
								s_sections.get(section.name).add(group);
					for (let group of section.groups)
						for (let s_group of groups)
							if (group.id === s_group.id)
								s_sections.get(section.name).add(s_group)
				}

				user.sections = new Map;
				for (const [k,v] of s_sections.entries()) {
					user.sections.set(k, Array.from(v))
				}
			}

			console.log(new Map(Array.from(user.sections).map(([k,v]) => ([k, v.map(x=>`${x.id} ${x.name}`)]))));

			user.export = {
				sections: sections.map( section => ({
					name: section.name,
					groups: user.sections.get(section.name)
				}))
			};

			filtered.push(user);
			await fs.writeFile(path.join(__dirname, '../result/filtered.json'), JSON.stringify(filtered));
			await fs.writeFile(path.join(__dirname, '../result/index.html') , tpl({users: filtered}), {encoding: 'utf8'});
		}
	}

	//console.log('[info] Повторная сортировка');
	//for (let user of filtered) {
	//	const groups = await api.enqueue('groups.get', {user_id: user.id, extended: 1, count: 1000})
	//}

	await fs.writeFile(path.join(__dirname, '../result/filtered.json'), JSON.stringify(filtered));
	await fs.writeFile(path.join(__dirname, '../result/index.html') , tpl({users: filtered}), {encoding: 'utf8'});
	try {await fs.symlink(__dirname + '/report/index.css' , path.join(__dirname, '../result/index.css'));} catch(e){}
	try {await fs.symlink(__dirname + '/report/index.js' , path.join(__dirname, '../result/index.js')); }catch(e){}

	console.log('//end');

})();
