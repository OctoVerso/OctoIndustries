/// Poki Iron Snout - Stubbed for offline use

function poki_loading_finished() {
	// no-op
}

function poki_loading_update(percents) {
	// no-op
}

function poki_gameplay_start(reason) {
	// no-op
}

function poki_gameplay_stop(reason) {
	// no-op
}

function poki_happy(value) {
	// no-op
}

function poki_break(tag) {
	// Immediately complete the break without showing ads
	poki_callback("poki.break.started", tag);
	poki_callback("poki.break.completed", tag);
}

function poki_rewarded_break(tag) {
	// Immediately grant the reward without showing ads
	poki_callback("poki.rewarded.started", tag);
	poki_callback("poki.rewarded.completed", tag);
}

function poki_callback(event, args) {
	gmCallback.game_callback(event, args);	
}
