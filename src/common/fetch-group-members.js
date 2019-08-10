module.exports = (api, client) => {
	let counter = 0;
	const proc = async (group, threshold, groups) => {
		if (await client.existsAsync(`sim:gr:${group.id}`))
			return ++counter;

		try {
			const size = (await api.enqueue('groups.getMembers', {v: 5.92, group_id: group.id, count: 1000}))
				.count;

			let members = [];
			if (size < threshold) {
				try {
					members = await api.fetch('groups.getMembers',
						{v: 5.92, group_id: group.id, count: 1000}, {limit: threshold});
					await client.saddAsync(`sim:gr:${group.id}`, members);
				} catch (e) {}
			}
			console.log(`[${++counter}/${groups.length}] Получена группа ${group.name}, участников: ${size >= threshold ? 'много': members.length }`);
		} catch (e) {
			console.log(`[${++counter}/${groups.length}] Не получена группа ${group.name}: ошибка доступа`);
		}
	};

	return async (groups, threshold) => {
		const items = groups.slice(0);
		await Promise.all(Array(20).fill(0).map(async() => {
			while (items.length)
				await proc(items.pop(), threshold, items);
		}));
	}
};