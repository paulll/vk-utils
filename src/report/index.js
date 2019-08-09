const $$ = document.querySelectorAll.bind(document);
for (let chartEl of Array.from($$('canvas'))) {
	const ctx = chartEl.getContext('2d');
	const data = JSON.parse(decodeURIComponent(atob(chartEl.dataset.user)));
	console.log(data);
	new Chart(ctx, {
		type: 'radar',
		data: {
			labels: data.sections.map(x =>x.name),
			datasets: [{
				data: data.sections.map(x => Math.log2(1+x.groups.length)),
				"fill":true,
				"backgroundColor":"rgba(255, 99, 132, 0.2)",
				"borderColor":"rgb(255, 99, 132)",
				"pointBackgroundColor":"rgb(255, 99, 132)",
				"pointBorderColor":"#fff"
				,"pointHoverBackgroundColor":"#fff",
				"pointHoverBorderColor":"rgb(255, 99, 132)"
			}]
		},
		options: {
			legend: false,
			tooltips: false,
			"elements": {
				"line": {
					"tension":0,
					"borderWidth":3
				}
			},
			scale: {
				ticks: {
					display: false
				}
			}

		}
	});
}