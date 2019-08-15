const createGraph = require('./graph');
const config = require('../../config');
const {API} = require("@paulll/vklib");
const Promise  = require('bluebird');
const weightFunc = (x, likesNeededToBeSure) => x?1/(1+Math.pow(Math.E,-(x-likesNeededToBeSure))):0; // Logistic function

module.exports = (api) => {
	const apiForcePublic = new API({
		access_token: false,
		service_token: config.service_token,
		debug: 1,
		v: 5.92
	});

	return async (id, {external_candidates=[], deep=true, heuristics=true}={}) => {
		const g = createGraph({multigraph: false});
		const source_friends = await api.fetch('friends.get', {user_id: id, v:5.92}, {limit: 5000});
		const source_followers = new Set((await api.fetch('users.getFollowers', {user_id: id, v:5.92, count: 1000}, {limit: 2000})).map(x=>+x));

		if (heuristics && source_friends.length < 750) {
			const candidates = new Map;
			const add = (id) => {
				const old = candidates.get(+id) || 0;
				candidates.set(+id, old + 1);
			};

			// parallel blocks
			await Promise.all([
				(async () => {
					const avatars = await api.fetch('photos.getAll', {owner_id: id, extended: 1, count: 200, v:5.92}, {limit: 2000, force_private: true});
					await Promise.all(avatars.map(async (avatar) => {
						if (avatar.likes && avatar.likes.count > 0) {
							(await api.fetch('likes.getList', {type: 'photo', count: 1000, v:5.92, item_id: avatar.id, owner_id: id}, {limit: 3000}))
								.map(x=>add(x));
						}
						if (avatar.comments && avatar.comments.count > 0) {
							const comments = await api.fetch('photos.getComments', {owner_id: id, photo_id: avatar.id, count: 100, v:5.92}, {limit: 100, force_private: true});
							for (const comment of comments)
								add(comment.from_id);
						}
					}));
				})(),
				(async () => {
					const comments = await api.fetch('photos.getAllComments', {owner_id: id, need_likes: 1, count: 100, v:5.92}, {limit: 1000, force_private: true});
					await Promise.all(comments.map(async (comment) => {
						if (comment.likes && comment.likes.count > 0) {
							(await api.fetch('likes.getList', {type: 'photo_comment', count: 1000, v:5.92, item_id: comment.id, owner_id: id}, {limit: 3000}))
								.map(x=>add(x));
						}
						if (comment.comments && comment.comments.count > 0) {
							const comments = await api.fetch('photos.getComments', {owner_id: id, photo_id: comment.id, count: 100, v:5.92}, {limit: 100, force_private: true});
							for (const comment of comments)
								add(comment.from_id);
						}
					}));
				})(),
				(async () => {
					const wall = await apiForcePublic.fetch('wall.get', {owner_id: id, count: 100, v:5.92}, {limit: 100});
					await Promise.all(wall.map(async (post) => {
						if (post.likes && post.likes.count > 0) {
							(await api.fetch('likes.getList', {type: 'post', count: 1000, v:5.92, owner_id: id, item_id: post.id}, {limit: 3000}))
								.map(x=>add(x));
						}
						if (post.comments && post.comments.count > 0) {
							const comments = await apiForcePublic.fetch('wall.getComments', {owner_id: id, post_id: post.id, count: 100, v:5.92}, {limit: 100});
							for (const comment of comments)
								add(comment.from_id);
						}
					}));
				})(),
			]);

			const neededToBeSure = Array.from(candidates.values()).sort()[Math.floor(candidates.size/2)];

			// probable links
			for (const [candidate, weight] of candidates.entries()) {
				const calculatedWeight = weightFunc(weight, neededToBeSure);
				const isFollower = source_followers.has(+candidate);
				if (calculatedWeight >= 0.5) {
					let [friendNode, keyNode] = [g.getNode(+candidate), g.getNode(+id)];
					if (!friendNode)
						friendNode = g.addNode(+candidate);
					if (!keyNode)
						keyNode = g.addNode(+id);
					g.addLink(friendNode, keyNode, {
						isFollower: isFollower,
						mediaWeight: calculatedWeight
					});
				}
			}

			const candidatesDeduped = new Set([...candidates.keys(), ...source_friends, ...external_candidates, id]);
			const L2Candidates = new Set;

			await Promise.all([...candidatesDeduped].map(async (key) => {
				const friends = (await apiForcePublic.fetch('friends.get', {user_id: key, v:5.95}, {limit: 5000})) || [];
				for (const friend of friends) {
					const weight = ((+key === +id|| +friend===+id )? weightFunc((+key===+id)? candidates.get(+friend) : candidates.get(+key), neededToBeSure) :0);
					let [friendNode, keyNode] = [g.getNode(+friend), g.getNode(+key)];
					if (!friendNode)
						friendNode = g.addNode(+friend);
					if (!keyNode)
						keyNode = g.addNode(+key);

					g.addLink(keyNode, friendNode, {
						mediaWeight: weight,
						isFriend: true
					});

					if (deep && friends.length < 500)
						L2Candidates.add(+friend);
				}
			}));

			if (deep) {
				for (const already of candidatesDeduped)
					L2Candidates.delete(+already);

				const k = L2Candidates.size; let p = 0;
				await Promise.all([...L2Candidates].map(async (key) => {
					const friends = (await apiForcePublic.fetch('friends.get', {user_id: key, v:5.94}, {limit: 300})) || [];
					console.log(++p, '/', k);
					for (const friend of friends) {
						const weight = ((+key === +id|| +friend===+id )? weightFunc((+key===+id)? candidates.get(+friend) : candidates.get(+key), neededToBeSure) :0);
						let [friendNode, keyNode] = [g.getNode(+friend), g.getNode(+key)];
						if (!friendNode)
							friendNode = g.addNode(+friend);
						if (!keyNode)
							keyNode = g.addNode(+key);

						g.addLink(keyNode, friendNode, {
							mediaWeight: weight,
							isFriend: true
						});
					}
				}));
			}

			return g;
		}


		const candidatesDeduped = new Set([...external_candidates, ...source_friends]);
		await Promise.all([...candidatesDeduped].map(async (key) => {
			const friends = (await apiForcePublic.fetch('friends.get', {user_id: key, v:5.93}, {limit: 5000})) || [];
			for (const friend of friends) {
				let [friendNode, keyNode] = [g.getNode(+friend), g.getNode(+key)];
				if (!friendNode)
					friendNode = g.addNode(+friend);
				if (!keyNode)
					keyNode = g.addNode(+key);

				g.addLink(keyNode, friendNode, {
					mediaWeight: 0,
					isFriend: true
				});
			}
		}));

		console.log('here');

		return g;
	}
};