import { Game, fighters } from './game.js';
import { Input } from './input.js';
import { Fx } from './fx.js';
import { BeatEmUp } from './beatemup.js';
import * as config from './config.js';
import * as audio from './audio.js';
import * as moves from './moves.js';
import * as pose from './pose.js';
import * as fighter from './fighter.js';
import * as blade from './blade.js';
import { animationFrames, attackClip, bootPreloadList, classIdleSource, entryAssetList, heroBackgroundList, stageEntryList } from './phaser-actors.js';

const published = { Game, fighters, Input, Fx, BeatEmUp, animationFrames, attackClip, bootPreloadList, classIdleSource, entryAssetList, heroBackgroundList, stageEntryList, ...config, ...audio, ...moves, ...pose, ...fighter, ...blade };
for (const [name, value] of Object.entries(published)) window[name] = value;

Game.init();
