"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

const mats = require('gl-matrix');
const mink = require('./../hyperboloid-model/index.js');
//const mink = require('hyperboloid-model');
const mod = require('mod-op');
const Deque = require("collections/deque");
const FastSet  = require("collections/fast-set");

module.exports = Tiling;

function Tiling(opts) {
  this.p = opts.p;// || (throw new Error("no p defined"));
  this.q = opts.q;// || (throw new Error("no q defined"));
  this.tiles = [{id: 0, connected: Array(this.p).fill(null)}]; //connected should be numbers
  this._tempId = 0;
  
  this.centerDist = this.findDistanceBetweenCenters(this.p, this.q);
  
  this.connectionMats = [];
  this.rotMats = [];
  let temp = mats.mat3.create();
  let move = mats.mat3.create();
  mink.xMove(move, this.centerDist);
  for (let i=0; i<this.p; i++) {
    mink.rot(temp, i*Math.PI*2/this.p);
    this.connectionMats.push(mats.mat3.mul(temp, temp, move));
    this.rotMats.push(mink.rot(temp, Math.PI - i*Math.PI*2/this.p));
  }
}

Tiling.prototype.findDistanceBetweenCenters = function(p, q) {
  let curMin = 0;
  let curMax = 7;
  let b = mats.vec3.create();
  let a = mats.vec3.create();
  let temp = mats.vec3.create();
  let m = mats.mat3.create();
  for (let k=0; k<500; k++) {
    let cur = (curMin+curMax)/2;
    mink.xMove(m, cur);    
    mats.vec3.copy(b, mink.origin);
    mats.vec3.transformMat3(a, b, m);
    for (let i=0; i<q-2; i++) {
      mats.vec3.copy(temp, a);
      mink.rotAroundPoint(m, a, Math.PI*2/p);
      mats.vec3.transformMat3(a, b, m);
      mats.vec3.copy(b, temp);
    }
    let d = mink.dist(a, mink.origin);
    if (d < cur) {
      curMin = cur;
    } else if (d > cur) {
      curMax = cur;
    } else {
      break;
    }
  }
  return (curMin+curMax)/2;
}

Tiling.prototype.nextId = function() {
  while (this.tiles[this._tempId]) {
    this._tempId++;
  }
  return this._tempId;
}

Tiling.prototype.expandTile = function(id) {
  let tile = this.tiles[id];
  for (let i=0; i<this.p; i++) {
    if (!isNull(tile.connected[i])) continue;
    console.log(tile.connected[i]);
    this.trySetNextTo(tile, i,  1);
    this.trySetNextTo(tile, i, -1);
    if (!isNull(tile.connected[i])) continue;
    let newTile = {id: this.nextId(), connected: Array(this.p).fill(null)};
    newTile.connected[0] = id;    
    this.tiles[newTile.id] = newTile;
    tile.connected[i] = newTile.id;
  }
}

Tiling.prototype.offset = function(tileA, tileB) {
  if (!tileA || !tileB) throw new Error("tile does not exist");
  for (let i=0; i<this.p; i++) {
    if (tileA.connected[i] == tileB.id) {
      return i;
    }
  }
  throw new Errow("tiles aren't connected");
}

Tiling.prototype.trySetNextTo = function(tile, i, dir) {
  if (!isNull(tile.connected[i])) return;  
  let curTileId = tile.connected[mod(i+dir,this.p)];
  if (isNull(curTileId)) return;
  let curTile = this.tiles[curTileId];
  if (!curTile) new Error("mismatched tile id");
  let prevTile = tile;
  for (let k=0; k<this.q-2; k++) {
    let off = this.offset(curTile, prevTile);
    let newCurTileID = curTile.connected[mod(off+dir, this.p)];
    if (isNull(newCurTileID)) return;
    let newCurTile = this.tiles[newCurTileID];
    if (!newCurTile) throw new Error("mismatched tile id");
    [prevTile, curTile] = [curTile, newCurTile];
  }
  let off = this.offset(curTile, prevTile);
  curTile.connected[mod(off+dir, this.p)] = tile.id;
  //this.tiles[curTileId].connected[i] = curTile.id;
  tile.connected[i] = curTile.id;
}  

// Returns a bunch of segments?
// Better to return a bunch of tile ids and offsets
Tiling.prototype.draw = function(curTileId, curViewOff, maxDepth=3, maxDist=4.5, extend=true) {
  let temp = mats.vec3.create();
  let tempMat = mats.mat3.create();
  let curTile = this.tiles[curTileId];
  curTile.lastOffset = curViewOff;
  curTile.lastDepth = 0;
  curTile.lastDist = mink.distToOrigin(mats.vec3.transformMat3(temp, mink.origin, curViewOff));
  let pending = Deque([curTile]);
  let doneIds = FastSet([curTile.id]);  
  let returnTiles = [];  
  let bestDist = curTile.lastDist;
  let bestTile = curTile;  
  let deltaMat = mats.mat3.create();
  
  while (pending.length > 0) {
    curTile = pending.shift();
    returnTiles.push(curTile);
    if (curTile.lastDist + 0.1 < bestDist) {
      bestTile = curTile;
      bestDist = curTile.lastDist;
    }
    if (curTile.lastDepth >= maxDepth || curTile.lastDist >= maxDist) {
      continue;
    }    
    for (let i=0; i<this.p; i++) {
      let curChildId = curTile.connected[i];
      if (extend && isNull(curChildId)) {
        this.expandTile(curTile.id);
        curChildId = curTile.connected[i];
      }
      if (isNull(curChildId)) continue;
      if (doneIds.has(curChildId)) continue;
      doneIds.add(curChildId);
      let curChild = this.tiles[curChildId];
      let off = this.offset(curChild, curTile);
      mats.mat3.mul(deltaMat, this.connectionMats[i], this.rotMats[off]);
      curChild.lastOffset = mats.mat3.mul(tempMat, curTile.lastOffset, deltaMat);
      mats.vec3.transformMat3(temp, mink.origin, curChild.lastOffset);
      curChild.lastDist = mink.distToOrigin(temp);
      curChild.lastDepth = curTile.lastDepth + 1;
      pending.push(curChild);
    }
  }
  return {tiles: returnTiles, viewTile: bestTile, viewOffset: bestTile.lastOffset};
}

function isNull(obj) {
  return (!obj && obj !== 0);
}