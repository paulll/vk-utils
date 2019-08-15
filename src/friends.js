const {API} = require('@paulll/vklib');
const config = require('../config');

require('./common/error-handler');
require('./common/array-chunk');

(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const getFriends = require('./common/friends')(api);
	const user = (await api.enqueue('users.get', {user_ids: process.argv.pop(), v: 5.92, lang: 0, fields: 'counters,sex'}, {force_private: true}))[0];
	const g = await getFriends(+user.id);
	const pairs = [];

	for (const link of g.getNode(+user.id).links) {
		const to = +link.to.id === +user.id ? link.from : link.to;
		pairs.push([to.id, {
				weight: link.data.mediaWeight + (+(!link.mutual && !!link.data.isFriend)) + +!!link.data.isFriend,
				mediaWeight: link.data.mediaWeight,
				tags: [
					link.data.isFriend ? '[F]' : '',
					link.data.isFollower ? '[f]' : '',
					!link.mutual && link.data.isFriend ? '[H]': '',
				].filter(x=>x.length).join(' ')
			}
		]);
	}

	pairs.sort((a,b) => b[1].weight - a[1].weight);
	const usersMap = new Map;

	for (const chunk of pairs.chunk(100)) {
		const users = await api.enqueue('users.get', {v:5.92, fields:'sex', lang: 0, user_ids: chunk.map(x=>x[0]).join(',')});
		for (const u of users)
			usersMap.set(u.id, u);
	}

	for (const [id, {tags, weight, mediaWeight}] of pairs) {
		const u = usersMap.get(+id);
		console.log(
			`${tags} ${u.first_name} ${u.last_name} [${u.sex===1?'ж':'м'}] :: ${mediaWeight} :: ${u.id}`
		);
	}
})();


