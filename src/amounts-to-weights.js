const Promise = require('bluebird');
const fs = require('fs').promises;
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');
const crypto = require('crypto');
const once = (ee, e) => new Promise(f => ee.once(e, f));

Promise.promisifyAll(redis);
const client = redis.createClient(16379);
const sumAmountWeight = (n) => ((1 - Math.pow(0.5, n))/(1-0.5));

Object.defineProperty(Array.prototype, 'chunk', {
	value: function(chunkSize) {
		const R = [];
		for (let i = 0; i < this.length; i += chunkSize)
			R.push(this.slice(i, i + chunkSize));
		return R;
	}
});


const scan = async (key, chunk_handler) => {
	let cursor = '0';
	do {
		let resp = await client.hscanAsync(key, cursor, 'COUNT', 1000);
		cursor = resp[0];
		await chunk_handler(new Map(resp[1].chunk(2)));
	} while (cursor !== '0');
};


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
	console.log(`[info] Это займет время..`);

	console.time('Всего времени');
	console.log('[info] Поиск кандидатов');
	await client.delAsync('tans');

	for (const section of sections) {
		console.log(`[info] Обработка секции: ${section.name}`);
		const secid = crypto.createHash('sha1').update(section.name).digest('hex').slice(0, 10);

		console.time('Отсортировано за');
		console.log('[info] Сортировка данных секции..');
		let cnt = 0;
		await scan(`tans:${secid}`, async (chunk) => {
			const promises = [];
			for (let [k, v] of chunk.entries()) {
				if (++cnt % 20000 === 0)
					console.log(`[progress] Запись ${cnt}`);
				promises.push(client.zincrbyAsync('tans', v ? Math.floor(134217728 * section.weight * sumAmountWeight(v )) : 0, k));
			}
			await Promise.all(promises);
		});
		console.timeEnd('Отсортировано за');
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