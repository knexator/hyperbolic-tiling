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
    mats.mat3.mul(temp, temp, move);
    this.connectionMats.push(mats.mat3.clone(temp));
    mink.rot(temp, Math.PI - i*Math.PI*2/this.p);
    this.rotMats.push(mats.mat3.clone(temp));
  }
}

Tiling.prototype.findDistanceBetweenCenters = function(p, q) {
  let curMin = 0;
  let curMax = 4;
  if (p==12 && q==5) {
    curMin = 3;//3.61;
    curMax = 4;//3.62;
  }
  if (p==4 && q==5) {
    return 1.0612750619050333;
    /*curMin = 1.04;
    curMax = 1.08;*/
  }
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
      /*console.log('a', a);
      console.log('b', b);
      console.log('m', m);*/
      mats.vec3.copy(temp, a);
      mink.rotAroundPoint(m, a, Math.PI*2/p);
      //mink.gramSchmidt(m, m);
      mats.vec3.transformMat3(a, b, m);
      mats.vec3.copy(b, temp);
    }    
    /*console.log('a', a);
    console.log('b', b);
    console.log('m', m);*/
    let d = mink.dist(a, mink.origin);
    //console.log(d);
    /*if (!d) {
      console.log('a', a);
      console.log('b', b);
      console.log('m', m);
    }*/
    if (d < cur) {
      curMin = cur;
    } else {//if (d > cur) {
      curMax = cur;
    } /*else {
      break;
    }*/
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


/*

const Tiling = require('./index.js');
const mats = require('gl-matrix');
const mink = require('./../hyperboloid-model/index.js');
function randomVec() {
  let vec;
  do {
    vec = mats.vec3.fromValues(4*(Math.random()-0.5),4*(Math.random()-0.5),4*(Math.random()-0.5));
  } while (mink.type(vec) != -1 || vec[2]<0);
  return mink.normalize(vec, vec);
}
function testMat() {
  let v1 = randomVec();
  let v2 = randomVec();
  //let v1 = mats.vec3.fromValues(-0.41899099946022034,-0.06083877757191658,1.0859349966049194);
  //let v2 = mats.vec3.fromValues(-1.5626362562179565, -0.7006760239601135, -1.983123540878296);
  let m = mats.mat3.create();
  mink.translationBetweenPoints(m, v1, v2);
  let temp = mats.vec3.create();
  mats.vec3.transformMat3(temp, v1, m);
  let d = mink.dist(v2, temp);
  let line = mats.vec3.create();
  //if (isNaN(d)) {
    console.log('v1 = mats.vec3.fromValues(...', v1, ')');
    console.log('v2', v2);
    console.log('line', mink.lineJoiningPoints(line, v1, v2));
    console.log('ideals', mink.idealsAtInfinity(mats.vec3.create(), mats.vec3.create(), line));
    console.log('dist', mink.dist(v1, v2));
    console.log('m', m);
    console.log('temp', temp);
  //}
  return d
}

temp1 = mats.vec3.transformMat3(mats.vec3.create(), lineA, R)
temp2 = mats.vec3.transformMat3(mats.vec3.create(), temp1, M)
temp3 = mats.vec3.transformMat3(mats.vec3.create(), temp2, S)

tempA = mats.mat3.mul(mats.mat3.create(), M, R);
tempB = mats.mat3.mul(mats.mat3.create(), S, tempA);
tempC = mats.vec3.transformMat3(mats.vec3.create(), lineA, tempB)

mink.translationAlongLine = function(out, line, distance) {
  if (distance == 0) {
    return mats.mat3.identity(out);
  }
  let lineA = mats.vec3.create();
  mink.normalize(lineA, line);
  let lineB = mats.vec3.create();
  let lineC = mats.vec3.create();
  mink.idealsAtInfinity(lineB, lineC, line);
  
  console.log('lineA', lineA)
  console.log('lineB', lineB)
  console.log('lineC', lineC)  
  
  let c = Math.cosh(distance);
  let s = Math.sinh(distance);
  let M = mats.mat3.fromValues(1, 0, 0,  0, c-s, 0,  0, 0, c+s);
  let S = mats.mat3.fromValues(...lineA, ...lineB, ...lineC);
  let R = mats.mat3.create();
  mats.mat3.invert(R, S);
  let temp = mats.mat3.create();
  mats.mat3.mul(temp, M, R);
  //let tempA = mats.mat3.mul(mats.mat3.create(), M, R);
  //let tempB = mats.mat3.mul(mats.mat3.create(), S, tempA);  
  return mats.mat3.mul(out, S, temp);
}


mink.dist = function(a, b) {
  var dot = mink.dot(a, b);
  var a_type = mink.type(a);
  var b_type = mink.type(b);
  
  if (a_type == -1 && b_type == -1) { // both points
    // Distance between two points
    return Math.acosh(Math.abs(dot));
    //return Math.acosh(-dot);
  }
  if (a_type == -1 && b_type == 1) { // point and line
    return Math.asinh(dot);
  }
  if (a_type == 1 && b_type == 1) { // both lines
    if (Math.abs(dot) > 1) {
      // ultraparallel, return distance between them
      return Math.acosh(Math.abs(dot));
    } else if (Math.abs(dot) == 1) {
      // parallel, they meet at infinity
      return 0;            
    } else {
      // both lines intersect, return angle between them
      return Math.acos(dot);
    }
  }
  // TODO: handle cases for ideal points
}

*/
