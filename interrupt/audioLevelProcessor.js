/*
 * @Author: steven.ye steven.ye@zoom.us
 * @Date: 2023-11-17 15:26:45
 * @LastEditors: steven.ye steven.ye@zoom.us
 * @LastEditTime: 2023-12-05 13:54:09
 * @FilePath: \tools_repo\webaudiodelayMeasurement\audioLevelProcessor.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
/**
 * A simple audio level node demo.
 *
 * @class AudioLevelProcessor
 * @extends AudioWorkletProcessor
 */
// Number of bars on the indicator.
// Note that the number of elements is specified because we are indexing it
// in the range of 0-32
const permutation =
[0,1,2,3,4,4,5,5,5,5,6,6,6,6,6,7,7,7,7,8,8,8,9,9,9,9,9,9,9,9,9,9,9]; // length 33

 class AudioLevelProcessor extends AudioWorkletProcessor {
    // When constructor() undefined, the default constructor will be implicitly
    // used.
  
    constructor() {
      super();
      this.port.onmessage = this.handleMessage.bind(this);
	  this.samples10ms = [];
	  this.levelFrameSize = sampleRate / 10;
	  this.canGetLevel = this.canGetLevel.bind(this);
	  this._levelR16 = 0;
	  this._level = 0;
    }

	canGetLevel() {
		return this.samples10ms.length >= this.levelFrameSize;
	}

	pushSamplesToCalculate(samples128) {
		if(samples128.length < 128) return;
		this.samples10ms.push(...samples128);
		// limit to 100ms
		if(this.samples10ms.length > this.levelFrameSize)
		{
			this.samples10ms = this.samples10ms.slice(-this.levelFrameSize);
		}
	}

	handleMessage(message)
	{
		if(this.canGetLevel())
		{
			this._calculateLevel();
			// console.log("Level: ", this._level, ", LevelR16: ", this._levelR16);
			this.port.postMessage({
				command: 'levelR16',
				level: this._levelR16
			});
		}
	}
    
	// 128 samples
    process(inputs, outputs) {
		if(inputs[0][0])
		this.pushSamplesToCalculate(inputs[0][0]);
		return true;
    }

	
	
	_calculateLevel () { 
		let absMax = 0;
		//10^((x-3)/10): 0dB->-4dB:level = 15,-4dB->-8dB:level = 14,...
		let sumSquare = 0;
		for(let i =0; i< this.samples10ms.length; i++) {
			// R16 level
			sumSquare += this.samples10ms[i] * this.samples10ms[i];
			// 0-10 level
			let tmpAbs = Math.abs(this.samples10ms[i])
			if(tmpAbs > absMax)
				absMax = tmpAbs;
		}
		
		let sumRms = sumSquare / this.samples10ms.length;
		let position = parseInt(absMax * 32768/ 1000);
		// Make it less likely that the bar stays at position 0. I.e. only if
		// its in the range 0-250 (instead of 0-1000)
		if ((position == 0) && (absMax > 250))
		{
			position = 1;
		}	
		this._level = permutation[position];
		this._levelR16 = this._getR16LevelFromSumRms(sumRms);
	};

	_getR16LevelFromSumRms(sumRms) {
		let level = 0;
		if (sumRms > 0.1995) {
		//-4dB
		level = 15;
		} else if (sumRms > 0.0794) {
		//-8dB
		level = 14;
		} else if (sumRms > 0.0316) {
		//-12dB
		level = 13;
		} else if (sumRms > 0.0126) {
		//-16dB
		level = 12;
		} else if (sumRms > 0.005) {
		//-20dB
		level = 11;
		} else if (sumRms > 0.002) {
		//-24dB
		level = 10;
		} else if (sumRms > 7.9433e-4) {
		//-28dB
		level = 9;
		} else if (sumRms > 3.1623e-4) {
		//-32dB
		level = 8;
		} else if (sumRms > 1.2589e-4) {
		//-36dB
		level = 7;
		} else if (sumRms > 5.0119e-5) {
		//-40dB
		level = 6;
		} else if (sumRms > 1.9953e-5) {
		//-44dB
		level = 5;
		} else if (sumRms > 7.9433e-6) {
		//-48dB
		level = 4;
		} else if (sumRms > 3.1623e-6) {
		//-52dB
		level = 3;
		} else if (sumRms > 1.2589e-6) {
		//-56dB
		level = 2;
		} else if (sumRms > 5.0119e-7) {
		//-60dB
		level = 1;
		} else {
		level = 0;
		}
		return level;
	}
  }
  
  registerProcessor('audioLevelProcessor', AudioLevelProcessor);