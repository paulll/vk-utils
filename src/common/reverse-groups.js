const fs = require('fs').promises;
const path = require('path');

module.exports = (client) => {
	const scan = async (patt, chunk_handler) => {
		let cursor = '0';
		do {
			let resp = await client.scanAsync(cursor, 'MATCH', patt);
			cursor = resp[0];
			await chunk_handler(resp[1]);
		} while (cursor !== '0');
	};

	const getGroups = async (id) => {
		// todo: очищать кэш при добавлении новых данных по группам в базу
		const cacheFile = path.join(__dirname, '../../cache/', `groups-${id}.json`);
		try {
			return JSON.parse(await fs.readFile(cacheFile, {encoding: "utf-8"}));
		} catch (e) {
			const result = [];
			await scan(`sim:gr:*`, async (groups) => {
				for (const gr of groups) {
					const joined = await client.sismemberAsync(gr, id);
					if (joined)
						result.push(+gr.slice(7));
				}
			});
			await fs.writeFile(cacheFile, JSON.stringify(result));
			return result;
		}
	};

	return {getGroups};
};

