module.exports = () => {
	const g = new Map;
	const listeners = new Map;
	const emit = (eventName, ...args) => {
		const event_listeners = listeners.get(eventName);
		if (event_listeners) for (let listener of event_listeners)
			listener(...args);
	};

	return {
		addNode: (id, data) => {
			if (!g.has(id)) {
				const node = {id, data, links: []};
				g.set(id, node);
				emit('node:add', node);
				return node;
			}
		},

		getNode: (id) => g.get(id),

		hasNode: (id) => g.has(id),

		addLink: (from, to, data) => {
			const existing = to.links.find(x => x.to === from);
			if (existing) {
				existing.mutual = true;
				Object.assign(existing.data, data);
				emit('link:add', existing);
				return existing;
			}

			const existingSameSide = from.links.find(x => x.to === to);
			if (existingSameSide) {
				Object.assign(existingSameSide.data, data);
				emit('link:update', existingSameSide);
				return existingSameSide;
			}

			const link = {from, to, data, mutual: false};
			from.links.push(link);
			to.links.push(link);

			emit('link:add', link);
			return link;
		},

		rmLinkDirected: (from, to) => {
			const fromIndex = from.links.findIndex(x => x.to === to || x.from === to);
			const link = from.links[fromIndex];
			if (link.mutual) {
				if (link.from === from) {
					const t = link.from; link.from = link.to; link.to = t; // swap(from, to)
				}
				link.mutual = false;
			} else {
				from.links.splice(fromIndex, 1);
				to.links.splice(to.links.indexOf(link), 1);
			}
			emit('link:rm', link);
		},

		rmLinkUndirected: (a, b) => {
			const aIndex = a.links.findIndex(x => x.to === b || x.from === b);
			const link = a.links[aIndex];
			a.links.splice(aIndex, 1);
			b.links.splice(b.links.indexOf(link), 1);
		},

		rmLink: (link) => {
			link.to.links.splice(link.to.links.indexOf(link), 1);
			link.from.links.splice(link.from.links.indexOf(link), 1);
		},

		getLinkDirected: (from, to) => {
			return from.links.find(x => x.to === to);
		},

		getLinkUndirected: (a, b) => {
			return a.links.find(x => x.to === b || x.from === b);
		},

		nodes: () => {
			return g.values();
		},

		on: (eventName, fx) => {
			const event_listeners = listeners.get(eventName);
			if (event_listeners) event_listeners.push(fx);
			else listeners.set(eventName, [fx]);
		}
	};
};