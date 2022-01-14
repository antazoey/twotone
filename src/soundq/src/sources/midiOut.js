/** CAV
* replaced original 'midiOut' instrument with a tightly scheduled MIDI Out
 * attached to a zero audio context constant
 * as an attempt to match the same timing of the sampler instruments
* todo: design a click or pulse synth with Tone.Js instead of original sine wave midiOut
**/

import audioNodeSource from './node';
import * as midi from '/src/engine/midiSetup';
import { WebMidi } from 'webmidi';

export default function midiOut(controller) {
	let frequency = 440;

	const {
		context
	} = controller;

	let output = null;
	let nodeSource = null;

	let midiAvailable = false;
	let submitted = false;
	let startTime = Infinity;
	let stopTime = Infinity;

	/**
	 * make sure port is available
	 */
	const currentOutput = midi.getCurrentMidiOutput();
	if (currentOutput !== undefined) {
		midiAvailable = true;
	}

	let midiNote = -1;

	return {
		done() {
			return nodeSource.done && nodeSource.done();
		},
		start(time, options = {}) {
			startTime = time;
			stopTime = Infinity;
			frequency = options.frequency || 440;
			midiAvailable = WebMidi.enabled;
			midiNote = options.note || 60;

		},
		stop(time) {
			stopTime = time;
			if (nodeSource) {
				nodeSource.stop(stopTime);
			}
		},
		finish() {
			submitted = false;
			startTime = Infinity;
			if (nodeSource && nodeSource.finish) {
				nodeSource.finish();
			}
			nodeSource = null;
		},
		request(untilTime) {
			if (untilTime > startTime && !submitted) {
				//create silent node and start nodeSource
				output = context.createConstantSource();
				output.offset.value = 0.0;

				nodeSource = audioNodeSource(output)(controller);
				nodeSource.start(startTime);
				nodeSource.stop(stopTime);
				submitted = true;
				midiNote = Math.round(69 + 12 * Math.log2(frequency / 440));

				/**
				 * WebAudio and WebMidi need to be synchronised in a special way
				 * https://github.com/haszari/sync-web-audio-web-midi
				 **/

				const perfNow = window.performance.now();
				const audioNow = context.currentTime;
				const audioContextOffsetSec =  perfNow / 1000.0  - audioNow;

				const startMidi = startTime * 1000 + audioContextOffsetSec * 1000;
				const endMidi = stopTime * 1000 + audioContextOffsetSec * 1000;

				midi.scheduleMidiNoteEvent({
					keyEvent: 'on',
					schedulingTime: startMidi,
					noteValue: midiNote
				}
				);

				midi.scheduleMidiNoteEvent({
					keyEvent: 'off',
					duration: 5,
					schedulingTime: endMidi,
					noteValue: midiNote
				}
				);


				return nodeSource.request(untilTime);
			}
			return null;
		},
		startEvent(soundEvent) {
			midiAvailable = WebMidi.enabled;
			return nodeSource.startEvent && nodeSource.startEvent(soundEvent) || null;
		},
		stopEvent(soundEvent) {
			if (nodeSource) {
				nodeSource.stopEvent(soundEvent);
			}
		},
		finishEvent(soundEvent) {
			// output.clear() is not implemented in base Midi API yet apparently
			// currentOutput.clear();
			if (midiAvailable && currentOutput ) {
				currentOutput.sendAllNotesOff();
			}
			if (nodeSource && nodeSource.finishEvent) {
				nodeSource.finishEvent(soundEvent);
			}
		}
	};
}