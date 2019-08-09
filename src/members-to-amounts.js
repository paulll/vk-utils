const Promise = require('bluebird');
const fs = require('fs').promises;
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');
const crypto = require('crypto');

Promise.promisifyAll(redis);
const client = redis.createClient(16379);

Object.defineProperty(Array.prototype, 'chunk', {
	value: function(chunkSize) {
		const R = [];
		for (let i = 0; i < this.length; i += chunkSize)
			R.push(this.slice(i, i + chunkSize));
		return R;
	}
});


(async () => {
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

	console.log(`[info] Всего разделов: ${sections.length}`);
	console.log(`[info] Это займет часы..`);

	console.time('Всего времени');
	console.log('[info] Поиск кандидатов');

	for (const section of sections) {
		console.log(`[info] Обработка секции: ${section.name}`);
		const secid = crypto.createHash('sha1').update(section.name).digest('hex').slice(0, 10);
		await client.delAsync(`tans:${secid}`);

		console.time('Обработка групп заняла');
		let cnt = 0;
		for (const group of section.groups) {
			if (++cnt % 50 === 0)
				console.log(`[progress] Обработка группы ${cnt} из ${section.groups.length} `);
			const members = await client.smembersAsync(`sim:gr:${group.id}`);
			const promises = [];
			for (const member of members)
				if (member)
					promises.push(client.hincrbyAsync(`tans:${secid}`, member, 1));
			await Promise.all(promises);
		}
		console.timeEnd('Обработка групп заняла');
	}

	console.log('[info] Обработка завершена');
	console.timeEnd('Всего времени');
})();

process
	.on('unhandledRejection', (reason, p) => {
		console.error(reason, 'Unhandled Rejection at Promise', p);
	})
	.on('uncaughtException', err => {
		console.error(err, 'Uncaught Exception thrown');
		process.exit(1);
	});