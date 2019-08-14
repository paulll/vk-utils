const Promise = require('bluebird');
const fs = require('fs').promises;
const savedGroups = new Map(require('../data/groups.json') || []);
const redis = require('redis');
const path = require('path');
const {API} = require('@paulll/vklib');
const config = require('../config');


require('./common/error-handler');
require('./common/array-chunk');

Promise.promisifyAll(redis);
const client = redis.createClient(config.redis.port);
const {getGroups} = require('./common/reverse-groups')(client);


(async () => {
	const api = new API({
		access_token: config.access_token,
		service_token: config.service_token
	});

	const {...user} = (await api.enqueue('users.get', {user_ids: process.argv.pop(),v: 5.92,  fields: 'counters,sex'}, {force_private: true}))[0];
	const groups = await getGroups(user.id);

	for (const groupChunk of groups.chunk(200)) {
		const data = await api.enqueue('groups.getById', {group_ids: groupChunk.join(','), v:5.92});
		for (const group of data)
			console.log(group.screen_name || group.id, group.name);
	}

	process.exit(0);
})();