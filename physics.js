window.onerror = function (ev, src, lineno, colno, err) {
	document.writeln("<p>" + ev + "</p>");
	document.writeln("<p>" + src + "</p>");
	document.writeln("<p>" + lineno + ":" + colno + "</p>");
	document.writeln("<p>" + err + "</p>");

	alert(`${ev}, ${src}, ${lineno}:${colno}, ${err}`);
}

/**
 * @type { HTMLCanvasElement }
 */
var scene = document.getElementById("scene");
var ctx = scene.getContext("2d");

var vWidth = window.innerWidth;
var vHeight = window.innerHeight;

var updateIdx = 999;
var tFps = 60;

var keysDown = [];

var paused = false;

function resizeCanvas() {
	vWidth = window.innerWidth;
	vHeight = window.innerHeight;
	scene.width = vWidth * window.devicePixelRatio;
	scene.height = vHeight * window.devicePixelRatio;
}

resizeCanvas();

var damagedImage01 = new Image();
damagedImage01.src = "./assets/damaged_01.png";
var damagedImage02 = new Image();
damagedImage02.src = "./assets/damaged_02.png";
var damagedImage03 = new Image();
damagedImage03.src = "./assets/damaged_03_3.png";
var damagedImage04 = new Image();
damagedImage04.src = "./assets/damaged_03_4.png";

var dt = 1;
var adt = 0;

var prevTime = 0;
var curTime = 0;

var phyEngine = new PgPhysics({ direction: new Vec2(0, 1).normalized, strength: 9.81 * 0 }, 1);

var mouse = {
	position: new Vec2(0, 0),
	previous: new Vec2(0, 0),
	velocity: new Vec2(0, 0),
	down: false,
	rightdown: false
}

var camera = new Camera(0, 0, 1);

function drawGrid(context, x, y, width, height, gridCellSize = 16, options = {}) {
	context.save();
	Object.assign(context, options);
	context.beginPath();

	if (typeof gridCellSize === "number") {
		for (var lx = x; lx <= x + width; lx += gridCellSize) {
			context.moveTo(lx, y);
			context.lineTo(lx, y + height);
		}

		for (var ly = y; ly <= y + height; ly += gridCellSize) {
			context.moveTo(x, ly);
			context.lineTo(x + width, ly);
		}
	} else if (typeof gridCellSize === "object") {
		for (var lx = x; lx <= x + width; lx += gridCellSize.x) {
			context.moveTo(lx, y);
			context.lineTo(lx, y + height);
		}

		for (var ly = y; ly <= y + height; ly += gridCellSize.y) {
			context.moveTo(x, ly);
			context.lineTo(x + width, ly);
		}
	}

	context.stroke();
	context.closePath();
	context.restore();
}

function getRotatedPoint(point, rotation, rotationPoint) {
	var cosR = Math.cos(rotation);
	var sinR = Math.sin(rotation);

	var dx = point.x - rotationPoint.x;
	var dy = point.y - rotationPoint.y;

	return new Vec2(rotationPoint.x + dx * cosR - dy * sinR, rotationPoint.y + dx * sinR + dy * cosR);
}

function drawMeterBar(context, x, y, width, height, bgColor, fillColor, value) {
	var dValue = clamp(0, 1, value);

	context.save();
	context.fillStyle = bgColor;
	context.beginPath();
	context.rect(x - width / 2, y - height / 2, width, height);
	context.fill();
	context.closePath();

	context.fillStyle = fillColor;
	context.beginPath();
	context.rect(x - width / 2, y - height / 2, dValue * width, height);
	context.fill();
	context.closePath();
	context.restore();
}

class Bullet {
	constructor(parent, x, y, radius, color, bc, velX, velY, health, speed, damage) {
		this.parent = parent;
		this.position = new Vec2(x, y);
		this.radius = radius;
		this.collider = PgPhysicsObject.createCircle(this, new Vec2(0, 0), this.radius, false, 11.3, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.velocity = new Vec2(velX, velY).add(this.parent.collider.velocity);
		this.collider.noColide.push(this.parent.collider.id);
		this.collider.class = "p-bullet";
		phyEngine.addObject(this.collider);
		this.color = color;
		this.bc = bc;
		// this.velocity = new Vec2(velX, velY);
		this.damage = damage;
		this.speed = speed;
		this.health = health;
	}

	update() {
		this.radius = this.collider.radius;
		// this.position.plusEquals(this.velocity);
	}

	draw(context) {
		context.save();
		context.lineWidth = context.lineWidth * 1.1;
		context.fillStyle = this.color;
		context.strokeStyle = this.bc;
		context.beginPath();
		context.arc(this.position.x, this.position.y, this.radius, 0, tau);
		context.stroke();
		context.fill();
		context.closePath();
		context.restore();
	}
}

class Gun {
	constructor(parent, x, y, width, height, color, bc, rotation, bulletHealth, bulletSpeed, bulletDamage, isADetail = false, reloadAni = true, reloadTime = 60, delay = 0, spread = 0, bulletColor = "default", bulletBC = "default") {
		this.parent = parent;
		this.position = new Vec2(x, y);
		this.width = width;
		this.height = height;
		this.color = color;
		this.bc = bc;
		this.rotation = degToRad * (rotation);
		this.bulletHealth = bulletHealth;
		this.bulletSpeed = bulletSpeed;
		this.bulletDamage = bulletDamage;
		this.isADetail = isADetail;
		this.reloadAni = reloadAni;
		this.reloadTime = reloadTime;
		this.curReloadTime = 0;
		this.delay = delay;
		this.curDelay = delay;
		this.spread = spread;
		this.bulletColor = bulletColor;
		this.bulletBC = bulletBC;
	}

	update(shoot, ishs = false, infoMapVar) {
		if (ishs) {
			if (this.curReloadTime > 0) {
				this.curReloadTime--;
			}

			if (shoot) {
				if (this.curDelay > 0) {
					this.curDelay--;
				}

				if (this.curReloadTime <= 0 && this.curDelay <= 0) {
					this.shoot(true, infoMapVar);
					this.curReloadTime = this.reloadTime * this.parent.reloadDampener;
				}
			} else {
				this.curDelay = this.delay * this.parent.reloadDampener;
			}

			return;
		}

		if (this.curReloadTime > 0) {
			this.curReloadTime--;
		}

		if (shoot) {
			if (this.curDelay > 0) {
				this.curDelay--;
			}

			if (this.curReloadTime <= 0 && this.curDelay <= 0) {
				this.shoot(false);
				this.curReloadTime = this.reloadTime * this.parent.reloadDampener;
			}
		} else {
			this.curDelay = this.delay * this.parent.reloadDampener;
		}
	}

	draw(context) {
		context.save();
		context.translate(this.parent.position.x, this.parent.position.y);
		context.rotate(this.parent.gunAngle + this.rotation);
		context.fillStyle = this.color;
		context.strokeStyle = this.bc;
		context.beginPath();
		if (this.reloadAni == true) {
			context.roundRect(this.position.x, this.position.y, this.width - ((this.curReloadTime / (this.reloadTime * this.parent.reloadDampener)) * Math.min(this.parent.height, this.parent.width) * 0.05), this.height, this.parent.height * 0.07);
			// roundRect(context, this.position.x, this.position.y, this.width - ((this.curReloadTime / (this.reloadTime * this.parent.reloadDampener)) * Math.min(this.parent.height, this.parent.width) * 0.05), this.height, this.parent.height * 0.07);
		} else {
			context.roundRect(this.position.x, this.position.y, this.width, this.height, this.parent.height * 0.07);
			// roundRect(context, this.position.x, this.position.y, this.width, this.height, this.parent.height * 0.07);
		}
		context.stroke();
		context.fill();
		context.closePath();
		context.restore();
	}

	shoot(ishs = false, infoMapVar) {
		if (this.isADetail || this.curReloadTime > 0 || this.curDelay > 0) {
			return;
		}

		if (ishs) {
			var bulletSpeed = (this.parent.width + this.parent.height) * 0.15;

			var gunAngle = this.parent.gunAngle + this.rotation + degToRad * (random(-this.spread, this.spread));

			var bulletVel = new Vec2(Math.cos(gunAngle) * ((this.bulletSpeed / 2) + bulletSpeed), Math.sin(gunAngle) * ((this.bulletSpeed / 2) + bulletSpeed));

			var spawnPoint = getRotatedPoint(new Vec2(this.parent.position.x + this.position.x + (this.width - (this.height / 2)), this.parent.position.y + this.position.y + (this.height / 2)), gunAngle, new Vec2(this.parent.position.x, this.parent.position.y));

			infoMapVar.createPickup(spawnPoint.x - (this.height / 2), spawnPoint.y - (this.height / 2), this.height, this.height, bulletVel.x, bulletVel.y, "healthkit");

			return;
		}

		// alert()

		// var audioS = new Audio("./assets/tank_shoot_test.wav");
		// audioS.play();

		var particleSpeed = this.width + this.height;

		var gunAngle = this.parent.gunAngle + this.rotation + degToRad * (random(-this.spread, this.spread));

		var bulletVel = new Vec2(Math.cos(gunAngle) * this.bulletSpeed, Math.sin(gunAngle) * this.bulletSpeed);

		var spawnPoint = getRotatedPoint(new Vec2(this.parent.position.x + this.position.x + (this.width - (this.height / 2)), this.parent.position.y + this.position.y + (this.height / 2)), gunAngle, new Vec2(this.parent.position.x, this.parent.position.y));

		// parent, x, y, radius, color, bc, velX, velY, health, speed, damage
		if (this.bulletColor !== "default" && this.bulletBC !== "default") {
			this.parent.bullets.push(new Bullet(this.parent, spawnPoint.x, spawnPoint.y, this.height / 2, this.bulletColor, this.bulletBC, bulletVel.x, bulletVel.y, this.bulletHealth, this.bulletSpeed, this.bulletDamage));
		} else {
			this.parent.bullets.push(new Bullet(this.parent, spawnPoint.x, spawnPoint.y, this.height / 2, this.parent.color, this.parent.bc, bulletVel.x, bulletVel.y, this.bulletHealth, this.bulletSpeed, this.bulletDamage));
		}

		// var particleS = new DirectionalParticleSpawner(pgPhyParticle, spawnPoint.x, spawnPoint.y, this.height / 2, { min: this.height / 8, max: this.height / 3 }, { min: (this.bulletSpeed * 0.6), max: (this.bulletSpeed * 1.6) }, 10, ["#ffdd20"], /*17,*/ { min: gunAngle, max: gunAngle }, this.parent.velX, this.parent.velY, { min: 10, max: 30 });
		// particleS.activate();
	}
}

function centeredGun(parent, offsetX, offsetY, width, height, color, bc, rotation, bulletHealth, bulletSpeed, bulletDamage, isADetail, reloadAni, reloadTime, delay, spread, bulletColor, bulletBC) {
	return new Gun(parent, offsetX, (-height / 2) + offsetY, width, height, color, bc, rotation, bulletHealth, bulletSpeed, bulletDamage, isADetail, reloadAni, reloadTime, delay, spread, bulletColor, bulletBC);
}

var tankWeapons = {
	basic: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "basic";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 0.8, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 0, 2)
		];
	},

	sniper: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "sniper";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 1.3, tank.height * 0.3, "#606060", "#404040", 0, tank.height * 5, 6, tank.height * 1.1, false, true, 60, 0, 0.5),
		];
	},

	shotgun: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "shotgun";
		return [
			new Gun(tank, 0, -tank.height * 0.2, tank.width, tank.height * 0.2, "#606060", "#404040", -4, tank.height * 0.8, 7, tank.height * 0.8, false, true, 60, 0, 4),
			new Gun(tank, 0, 0, tank.width, tank.height * 0.2, "#606060", "#404040", 4, tank.height * 0.8, 7, tank.height * 0.8, false, true, 60, 0, 5),
			new Gun(tank, 0, -tank.height * 0.1, tank.width, tank.height * 0.2, "#606060", "#404040", -2, tank.height * 0.8, 7, tank.height * 0.8, false, true, 60, 0, 5),
			new Gun(tank, 0, -tank.height * 0.1, tank.width, tank.height * 0.2, "#606060", "#404040", 2, tank.height * 0.8, 7, tank.height * 0.8, false, true, 60, 0, 4),
			new Gun(tank, 0, -tank.height * 0.3, tank.width, tank.height * 0.6, "#606060", "#404040", 0, 0, 0, 0, true, true, 60, 0, 5)
		];
	},

	devS: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "devS";
		return [
			new Gun(tank, 0, -tank.height * 0.2, tank.width, tank.height * 0.2, "#606060", "#404040", -4, tank.height * 100, 15, tank.height * 100, false, true, 15, 0, 4),
			new Gun(tank, 0, 0, tank.width, tank.height * 0.2, "#606060", "#404040", 4, tank.height * 100, 15, tank.height * 100, false, true, 15, 0, 5),
			new Gun(tank, 0, -tank.height * 0.1, tank.width, tank.height * 0.2, "#606060", "#404040", -2, tank.height * 100, 15, tank.height * 100, false, true, 15, 0, 5),
			new Gun(tank, 0, -tank.height * 0.1, tank.width, tank.height * 0.2, "#606060", "#404040", 2, tank.height * 100, 15, tank.height * 100, false, true, 15, 0, 4),
			new Gun(tank, 0, -tank.height * 0.3, tank.width, tank.height * 0.6, "#606060", "#404040", 0, 0, 0, 0, true, true, 15, 0, 5)
		];
	},

	twinFire: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "twinFire";

		return [
			// new Gun(tank, 0, -tank.height * 0.25, tank.width * 0.8, tank.height * 0.25, "#606060", "#404040", 0, tank.height, 6, tank.height * 1.2),
			// new Gun(tank, 0, tank.height * 0.1, tank.width * 0.8, tank.height * 0.25, "#606060", "#404040", 0, tank.height, 6, tank.height * 1.2)
			centeredGun(tank, 0, -tank.height * 0.2, tank.width * 0.8, tank.height * 0.25, "#606060", "#404040", 0, tank.height, 6, tank.height * 1.2, false, true, 60, 0, 2),
			centeredGun(tank, 0, tank.height * 0.2, tank.width * 0.8, tank.height * 0.25, "#606060", "#404040", 0, tank.height, 6, tank.height * 1.2, false, true, 60, 30, 2)
		];
	},

	stationary: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "stationary";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 0, 2)
		];
	},

	dev: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "dev";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 0.8, tank.height * 0.3, "#606060", "#404040", 0, tank.height * 10, 10, tank.height * 10, false, true, 60, 0, 2)
		];
	},

	supressor: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "supressor";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 1.3, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 0, 3),
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 1.2, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 15, 3),
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 1.1, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 30, 3),
			new Gun(tank, 0, -tank.height * 0.15, tank.width, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 6, tank.height, false, true, 60, 45, 3)
		];
	},

	minigun: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "minigun";
		return [
			new Gun(tank, 0, -tank.height * 0.25, tank.width * 1.05, tank.height * 0.1, "#606060", "#404040", 0, tank.height * 0.8, 7, tank.height * 0.8, true, true, 12, 4, 0),
			new Gun(tank, 0, tank.height * 0.15, tank.width * 1.05, tank.height * 0.1, "#606060", "#404040", 0, tank.height * 0.8, 7, tank.height * 0.8, true, true, 12, 8, 0),
			new Gun(tank, 0, -tank.height * 0.05, tank.width * 1.05, tank.height * 0.1, "#606060", "#404040", 0, tank.height * 0.7, 7, tank.height * 0.6, false, true, 12, 0, 1),
			new Gun(tank, tank.width * 0.5, -tank.height * 0.3, tank.width * 0.1, tank.height * 0.6, "#606060", "#404040", 0, tank.height * 0.8, 7, tank.height * 0.8, true, false),
			new Gun(tank, tank.width * 0.8, -tank.height * 0.3, tank.width * 0.1, tank.height * 0.6, "#606060", "#404040", 0, tank.height * 0.8, 7, tank.height * 0.8, true, false)
		];
	},

	cannon: function (tank) {
		tank.gunSfx = "./assets/gun_cannon.wav";
		tank.weaponClass = "cannon";
		return [
			new Gun(tank, 0, -tank.height * 0.35, tank.width * 1.5, tank.height * 0.7, "#606060", "#404040", 0, tank.height * 8, 6, tank.height * 2, false, true, 240, 0, 3)
		];
	},

	tmpFlamethrower: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "tmpFlamethrower";
		return [
			new Gun(tank, -tank.width * 0.4, tank.height * 0.15, tank.width * 0.7, tank.height * 0.3, "#606060", "#404040", 90, tank.height * 0.6, 5, tank.height * 0.4, true, false),
			new Gun(tank, tank.width * 0.35, tank.height * 0.2, tank.width * 0.2, tank.height * 0.2, "#ff8000", "#804000", 90, tank.height * 0.6, 5, tank.height * 0.4, true, false),
			new Gun(tank, 0, -tank.height * 0.15, tank.width, tank.height * 0.3, "#606060", "#404040", -2, tank.height * 0.6, 5, tank.height * 0.4, false, true, 12, 8, 6, "#ffcc00", "#ffcc00"),
			new Gun(tank, 0, -tank.height * 0.15, tank.width, tank.height * 0.3, "#606060", "#404040", 2, tank.height * 0.6, 5, tank.height * 0.4, false, true, 12, 4, 6, "#ffcc00", "#ffcc00"),
			new Gun(tank, 0, -tank.height * 0.15, tank.width, tank.height * 0.3, "#606060", "#404040", 0, tank.height * 0.6, 5, tank.height * 0.4, false, true, 12, 0, 6, "#ffcc00", "#ffcc00")
		];
	},

	fieldGun: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "fieldGun";
		return [
			new Gun(tank, 0, -tank.height * 0.3, tank.width * 0.7, tank.height * 0.3, "#606060", "#404040", -12, tank.height * 0.5, 6, tank.height * 0.5),
			new Gun(tank, 0, tank.height * 0, tank.width * 0.7, tank.height * 0.3, "#606060", "#404040", 12, tank.height * 0.5, 6, tank.height * 0.5),
			new Gun(tank, 0, -tank.height * 0.2, tank.width * 0.9, tank.height * 0.4, "#606060", "#404040", 0, tank.height * 1.8, 7, tank.height * 1.2),
			new Gun(tank, 0, -tank.height * 0.25, tank.width * 0.8, tank.height * 0.5, "#606060", "#404040", 0, tank.height * 1.2, 7, tank.height * 1.2)
		];
	},

	liquidNitrogenDispenser: function (tank) {
		tank.gunSfx = "./assets/gun_nemp_3.mp3";
		tank.weaponClass = "liquidNitrogenDispenser";
		return [
			new Gun(tank, 0, -tank.height * 0.15, tank.width * 0.8, tank.height * 0.3, "#606060", "#404040", 0, tank.height, 3, tank.height, true, "#80ccff", "#80ccff"),
			new Gun(tank, 0, -tank.height * 0.05, tank.width * 0.8, tank.height * 0.1, "#606060", "#404040", 0, tank.height, 3, tank.height, false, "#80ccff", "#80ccff")
		];
	},

	neutralizerEMP: function (tank) {
		tank.gunSfx = "./assets/gun_nemp_3.mp3";
		tank.weaponClass = "neutralizerEMP";
		return [
			// new Gun(tank, -tank.height * 0.5, -tank.height * 0.5, tank.width, tank.height, "#606060", "#404040", 0, tank.height, 3, tank.height, false, "#80ccff", "#80ccff"),
			// new Gun(tank, 0, -tank.height * 0.05, tank.width * 0.8, tank.height * 0.1, "#606060", "#404040", 0, tank.height, 3, tank.height, false, "#80ccff", "#80ccff")
		];
	},

	d360: function (tank) {
		tank.gunSfx = "./assets/gun_generic.wav";
		tank.weaponClass = "d360";

		var guns = [];

		var gunA = 10;

		for (var i = 0; i < gunA; i++) {
			guns.push(new Gun(tank, 0, (-tank.height * 0.15) / gunA, tank.width * 0.8, (tank.height * 0.3) / gunA, "#606060", "#404040", i * (360 / gunA), tank.height, 6, tank.height));
		}

		return guns;
	}
}

class Player {
	constructor(x, y, width, height, color, bc, weapons, health = 1) {
		this.position = new Vec2(x, y);
		this.width = width;
		this.height = height;
		this.collider = PgPhysicsObject.createRectangle(this, new Vec2(0, 0), width, height, false, 7.85, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.onlyCollide.push(NaN);
		this.acceleration = 1;
		this.rotation = 0;
		this.targetRotation = 0;
		this.color = color;
		this.bc = bc;
		this.maxHealth = (this.width + this.height) * 4;
		this.health = this.maxHealth * health;
		this.healthPC = this.health / this.maxHealth;
		this.tGunAngle = 0;
		this.gunAngle = 0;
		this.reloadDampener = 1;
		this.weapons = this.getWeaponsArray(weapons);
		this.bullets = [];
	}

	getWeaponsArray(weapons) {
		var newWeapons = tankWeapons[weapons];
		return newWeapons(this);
	}

	setWeapons(weapons) {
		var newWeapons = tankWeapons[weapons];
		this.weapons = newWeapons(this);
	}

	update(moving = false, speedMultiplier = 1, turningAmount = 0, movementDir = 1) {
		this.width = this.collider.width;
		this.height = this.collider.height;

		this.gunAngle = lerpAngle(this.gunAngle, this.tGunAngle, 0.5);

		if (this.health < 0) {
			this.health = 0;
		}

		if (this.health > this.maxHealth) {
			this.health = this.maxHealth;
		}

		this.maxHealth = (this.width + this.height) * 4;
		this.healthPC = this.health / this.maxHealth;

		this.targetRotation += turningAmount;

		var angularDifference = getShortestAngleDist(this.collider.rotation, this.collider.rotation + turningAmount);

		this.collider.angularAcceleration += angularDifference * 0.1;
		this.collider.angularVelocity *= 0.9;
		// this.collider.rotation = lerpAngle(this.collider.rotation, this.targetRotation, 0.1);

		if (moving == true) {
			this.collider.applyForce(new Vec2(Math.cos(this.collider.rotation), Math.sin(this.collider.rotation)).multiply(this.acceleration * this.collider.mass * movementDir * speedMultiplier));
		}

		this.collider.velocity.timesEquals(0.8);

		this.healthPC = this.health / this.maxHealth;

		for (var i = 0; i < this.weapons.length; i++) {
			var weapon = this.weapons[i];

			weapon.update(mouse.down);
		}

		for (var i = 0; i < this.bullets.length; i++) {
			var bullet = this.bullets[i];

			// if (devMode == false) {
			bullet.update();
			// }


			if (/*bullet.collider.velocity.length() < 0.5 ||*/ bullet.health <= 0 || bullet.position.x < (-1024 - bullet.radius) || bullet.position.y < (-1024 - bullet.radius) || bullet.position.x > (1024 + bullet.radius) || bullet.position.y > (1024 + bullet.radius)) {
				phyEngine.removeObject((this.bullets[i].collider));
				this.bullets.splice(i, 1);
				i--;
				continue;
			}
		}
	}

	draw(context) {
		context.save();
		context.lineWidth = Math.min(this.height, this.width) * 0.1;
		// context.lineWidth = 3.2;

		// this.lAngle = lerp(this.lAngle, Math.atan2(this.velY / 2, this.velX / 2), 0.5);

		context.save();
		context.translate(this.position.x, this.position.y);
		context.rotate(this.collider.rotation);
		// context.rotate(this.lAngle);
		context.fillStyle = this.color;
		context.strokeStyle = this.bc;
		context.beginPath();
		context.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, Math.min(this.height, this.width) * 0.15);
		// roundRect(context, -this.width / 2, -this.height / 2, this.width, this.height, Math.min(this.height, this.width) * 0.15);
		context.fill();
		context.stroke();
		context.closePath();

		if (this.healthPC < 0.3) {
			context.drawImage(damagedImage03, -this.width / 2, -this.height / 2, this.width, this.height);
		} else if (this.healthPC < 0.6) {
			context.drawImage(damagedImage02, -this.width / 2, -this.height / 2, this.width, this.height);
		} else if (this.healthPC < 0.8) {
			context.drawImage(damagedImage01, -this.width / 2, -this.height / 2, this.width, this.height);
		}

		context.restore();

		for (var i = 0; i < this.bullets.length; i++) {
			var bullet = this.bullets[i];

			bullet.draw(context);
		}

		for (var i = 0; i < this.weapons.length; i++) {
			var weapon = this.weapons[i];

			weapon.draw(context);
		}

		context.fillStyle = this.color;
		context.strokeStyle = this.bc;
		context.beginPath();
		context.arc(this.position.x, this.position.y, Math.min(this.height, this.width) * 0.35, 0, tau);
		context.fill();
		context.stroke();
		context.closePath();

		// context.fillStyle = this.color;
		// context.strokeStyle = this.bc;
		// context.save();
		// context.translate(this.x + this.width / 2, this.y + this.height / 2);
		// context.rotate(this.gunAngle);
		// context.beginPath();
		// context.roundRect(-(this.width * 0.3), -(this.height * 0.35), this.width * 0.6, this.height * 0.7, Math.min(this.height, this.width) * 0.15);
		// context.fill();
		// context.stroke();
		// context.closePath();
		// context.restore();

		context.save();
		context.translate(this.position.x, this.position.y);
		context.rotate(this.gunAngle);
		if (this.healthPC < 0.6) {
			context.drawImage(damagedImage04, -Math.min(this.width, this.height) / 2, -Math.min(this.width, this.height) / 2, Math.min(this.width, this.height), Math.min(this.width, this.height));
		}
		context.restore();

		// if (this.healthPC < 1) {
		// 	drawMeterBar(context, this.position.x, this.position.y + (this.height * 0.7), this.width, this.height * 0.2, "#000000", "#00ff00", this.healthPC);
		// }

		// if (this.lTread.healthPC < 1) {
		// 	drawMeterBar(context, this.position.x + (this.width * 0.15), this.y + (this.height * 1.4), this.width * 0.3, this.height * 0.1, "#000000", "#00ffff", this.lTread.healthPC);
		// }

		// if (this.engine.healthPC < 1) {
		// 	drawMeterBar(context, this.position.x + (this.width / 2), this.y + (this.height * 1.4), this.width * 0.3, this.height * 0.1, "#000000", "#ffff00", this.engine.healthPC);
		// }

		// if (this.rTread.healthPC < 1) {
		// 	drawMeterBar(context, this.position.x + (this.width * 0.85), this.y + (this.height * 1.4), this.width * 0.3, this.height * 0.1, "#000000", "#00ffff", this.rTread.healthPC);
		// }

		// this.lTread.draw(context);
		// this.engine.draw(context);
		// this.rTread.draw(context);

		context.restore();
	}
}

class Wall {
	constructor(x, y, width, height, color, bc) {
		this.position = new Vec2(x, y);
		this.width = width;
		this.height = height;
		this.collider = PgPhysicsObject.createRectangle(this, new Vec2(0, 0), width, height, true, 1, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.class = "u-wall";
		this.rotation = 0;
		this.color = color;
		this.bc = bc;
	}

	update() {
		this.width = this.collider.width;
		this.height = this.collider.height;

		this.collider.velocity.timesEquals(0.8);
		this.collider.angularVelocity *= 0.8;
	}

	draw(context) {
		context.save();
		context.lineWidth = (Math.min(this.width, this.height) / 2) * 0.05;
		context.strokeStyle = this.bc;
		context.fillStyle = this.color;

		context.translate(this.position.x, this.position.y);
		context.rotate(this.rotation);
		context.beginPath();
		context.rect(-this.width / 2, -this.height / 2, this.width, this.height);
		context.fill();
		context.stroke();
		context.closePath();
		context.restore();
	}
}

class CircleWall {
	constructor(x, y, radius, color, bc) {
		this.position = new Vec2(x, y);
		this.radius = radius;
		this.collider = PgPhysicsObject.createCircle(this, new Vec2(0, 0), radius, true, 1, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.class = "u-wall";
		this.rotation = 0;
		this.color = color;
		this.bc = bc;
	}

	update() {
		this.radius = this.collider.radius;

		this.collider.velocity.timesEquals(0.8);
		this.collider.angularVelocity *= 0.8;
	}

	draw(context) {
		context.save();
		context.lineWidth = this.radius * 0.05;
		context.strokeStyle = this.bc;
		context.fillStyle = this.color;

		context.translate(this.position.x, this.position.y);
		context.rotate(this.rotation);
		context.beginPath();
		context.arc(0, 0, this.radius, 0, tau, false);
		context.fill();
		context.stroke();
		context.closePath();

		context.beginPath();
		context.moveTo(0, 0);
		context.lineTo(this.radius, 0);
		context.stroke();
		context.closePath();

		context.restore();
	}
}

class BreakableWall {
	constructor(x, y, width, height, color, bc) {
		this.position = new Vec2(x, y);
		this.width = width;
		this.height = height;
		this.collider = PgPhysicsObject.createRectangle(this, new Vec2(0, 0), width, height, false, 1.44, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.onlyCollide.push(NaN);
		this.collider.class = "b-wall";
		this.health = (this.width + this.height) * 4;
		this.rotation = 0;
		this.color = color;
		this.bc = bc;
	}

	update() {
		this.width = this.collider.width;
		this.height = this.collider.height;

		this.collider.velocity.timesEquals(0.8);
		this.collider.angularVelocity *= 0.8;
	}

	draw(context) {
		context.save();
		context.lineWidth = (Math.min(this.width, this.height) / 2) * 0.05;
		context.strokeStyle = this.bc;
		context.fillStyle = this.color;

		context.translate(this.position.x, this.position.y);
		context.rotate(this.rotation);
		context.beginPath();
		context.rect(-this.width / 2, -this.height / 2, this.width, this.height);
		context.fill();
		context.stroke();
		context.closePath();
		context.restore();
	}
}

class BreakableCircleWall {
	constructor(x, y, radius, color, bc) {
		this.position = new Vec2(x, y);
		this.radius = radius;
		this.collider = PgPhysicsObject.createCircle(this, new Vec2(0, 0), radius, false, 1.44, new Vec2(0, 0), 0.4, 0.6, 0.4, false);
		this.collider.onlyCollide.push(NaN);
		this.collider.class = "b-wall";
		this.health = tau * this.radius * 2;
		this.rotation = 0;
		this.color = color;
		this.bc = bc;
	}

	update() {
		this.radius = this.collider.radius;

		this.collider.velocity.timesEquals(0.8);
		this.collider.angularVelocity *= 0.8;
	}

	draw(context) {
		context.save();
		context.lineWidth = this.radius * 0.05;
		context.strokeStyle = this.bc;
		context.fillStyle = this.color;

		context.translate(this.position.x, this.position.y);
		context.rotate(this.rotation);
		context.beginPath();
		context.arc(0, 0, this.radius, 0, tau, false);
		context.fill();
		context.stroke();
		context.closePath();
		// context.beginPath();
		// context.rect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
		// context.fill();
		// context.stroke();
		// context.closePath();

		context.restore();
	}
}

var player = new Player(0, 0, 32, 32, "#00ff00", "#008000", "basic", 1);
// player.collider.rotation = -Math.PI / 2;

var map01 = [
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
	[0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 1],
	[0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 2, 0, 0, 1],
	[0, 0, 1, 0, 0, 2.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
];

function loadMap(map, offsetX = 0, offsetY = 0, gridSize = 128) {
	var loadedMapObj = {
		walls: [],
		pickups: [],
		playerStart: {
			position: new Vec2(0, 0),
			width: 32,
			height: 32,
			active: false
		}
	};

	var tileOffsetX = -1024 + offsetX + gridSize / 2;
	var tileOffsetY = -1024 + offsetY + gridSize / 2;

	for (var i = 0; i < map.length; i++) {
		for (var j = 0; j < map[i].length; j++) {
			if (map[i][j] === 1) {
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#808080", "#606060"));
			}

			if (map[i][j] === 1.5) {
				loadedMapObj.walls.push(new CircleWall(tileOffsetX, tileOffsetY, gridSize / 2, "#808080", "#606060"));
			}

			// if (map[i][j] === 2) {
			// 	this.createPickup(tileOffsetX + (gridSize / 2) - 16, tileOffsetY + (gridSize / 2) - 16, 32, 32, 0, 0, "healthkit");
			// }

			// if (map[i][j] === 2.5) {
			// 	this.createPickup(tileOffsetX + (gridSize / 2) - 16, tileOffsetY + (gridSize / 2) - 16, 32, 32, 0, 0, "repairkit");
			// }

			if (map[i][j] === 3) {
				// 	this.createHealthStation(tileOffsetX + (gridSize / 4), tileOffsetY + (gridSize / 4), gridSize / 2, gridSize / 2, "#ff0000", "#800000", "#ffffff", "basic", 0);
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#808080", "#606060"));
			}

			if (map[i][j] === 3.25) {
				// 	this.createHealthStation(tileOffsetX + (gridSize / 4), tileOffsetY + (gridSize / 4), gridSize / 2, gridSize / 2, "#ff0000", "#800000", "#ffffff", "basic", degToRad * (90));
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#808080", "#606060"));
			}

			if (map[i][j] === 3.5) {
				// 	this.createHealthStation(tileOffsetX + (gridSize / 4), tileOffsetY + (gridSize / 4), gridSize / 2, gridSize / 2, "#ff0000", "#800000", "#ffffff", "basic", degToRad * (180));
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#808080", "#606060"));
			}

			if (map[i][j] === 3.75) {
				// this.createHealthStation(tileOffsetX + (gridSize / 4), tileOffsetY + (gridSize / 4), gridSize / 2, gridSize / 2, "#ff0000", "#800000", "#ffffff", "basic", degToRad * (-90));
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#808080", "#606060"));
			}

			// if (map[i][j] === 4) {
			// 	this.createWall(tileOffsetX, tileOffsetY, gridSize * 3, gridSize * 3, "transparent", "transparent", 2);
			// 	this.createDummy(tileOffsetX + (gridSize * 1.5), tileOffsetY + (gridSize * 1.5), 32, 32, "#00ffff", "#008080", "shotgun", degToRad * (190));
			// 	this.createImage(tileOffsetX, tileOffsetY, gridSize * 3, gridSize * 3, workshopImage);
			// }

			if (map[i][j] === 5) {
				loadedMapObj.walls.push(new Wall(tileOffsetX, tileOffsetY, gridSize, gridSize, "transparent", "transparent"));
			}

			if (map[i][j] === 6) {
				loadedMapObj.playerStart.position.x = tileOffsetX;
				loadedMapObj.playerStart.position.y = tileOffsetY;
				loadedMapObj.playerStart.width = gridSize;
				loadedMapObj.playerStart.height = gridSize;
				loadedMapObj.playerStart.active = true;
			}

			// if (map[i][j] === 7) {
			// 	this.createWall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#dddddd", "#aaaaaa", 3);
			// }

			// if (map[i][j] === 8) {
			// 	this.createSpawner(tileOffsetX + (gridSize / 2), tileOffsetY + (gridSize / 2), gridSize / 2, "e", 180, 1);
			// }

			// if (map[i][j] === 9) {
			// 	this.createSpawner(tileOffsetX + (gridSize / 2), tileOffsetY + (gridSize / 2), gridSize / 2, "a", 180, 1);
			// }

			// if (map[i][j] === 10) {
			// 	this.createWall(tileOffsetX, tileOffsetY, gridSize, gridSize, "#606060", "#454545", 4);
			// }

			tileOffsetX += gridSize;
		}

		tileOffsetX = -1024 + offsetX + gridSize / 2;
		tileOffsetY += gridSize;
	}

	return loadedMapObj;
}

var walls = [
	new Wall(-192, -64, 128, 128, "#808080", "#606060"),
	new Wall(-192, -192, 128, 128, "#808080", "#606060"),
	new CircleWall(-192, 64, 64, "#808080", "#606060"),
	new Wall(-64, -160, 128, 128, "#808080", "#606060"),
	new Wall(128, -160, 128, 128, "#808080", "#606060")
	// new Wall(-128, 0, 128, 128, "#808080", "#606060")
];

var sqrtPI = Math.sqrt(Math.PI);

var map01 = [
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
	[0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 1],
	[0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 0, 1, 0, 0, 0, 1, 1, 1, 1.5, 0, 0, 2, 0, 0, 1],
	[0, 0, 1, 0, 0, 2.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
];

var map02 = [
	[0, 0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 1, 1, 1, 1, 1, 1],
	[0, 0, 1, 2, 0, 4, 0, 0, 1],
	[0, 0, 1, 0, 1, 0, 0, 0, 1],
	[0, 0, 1, 0, 1, 0, 0, 0, 1],
	[0, 0, 0, 0, 1, 1, 1, 1, 1],
	[0, 0, 1, 1, 1, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0]
];

var map03 = [
	[0, 0, 0, 5, 5, 5],
	[0, 0, 0, 5, 5, 5],
	[0, 0, 0, 5, 5, 5],
	[5, 5, 5, 5, 5, 5],
	[5, 5, 5, 5, 5, 5],
	[5, 5, 5, 5, 5, 5]
];

var loadedMap01 = loadMap(map01, 0, 0, 128);
var loadedMap02 = loadMap(map02, 1216, 1216, 64);
var loadedMap03 = loadMap(map03, 1536, 1344, 32);

walls = loadedMap01.walls;

for (var i = 0; i < 8; i++) {
	for (var j = 0; j < 8; j++) {
		// walls.push(new BreakableCircleWall(4 + 8 * i, -188 + 8 * j, 4, "#dddddd", "#aaaaaa"));
		// walls.push(new BreakableWall(4 + 8 * i, -188 + 8 * j, 8, 8, "#dddddd", "#aaaaaa"));
		// walls.push(new BreakableWall(8 + 16 * i, -184 + 16 * j, 15, 15, "#dddddd", "#aaaaaa"));
		walls.push(new BreakableCircleWall(8 + 16 * i, -184 + 16 * j+100, 8, "#dddddd", "#aaaaaa"));
	}
}

walls.push(...loadedMap02.walls);

walls.push(...loadedMap03.walls);

phyEngine.addObject(player.collider);

for (var i = 0; i < walls.length; i++) {
	phyEngine.addObject(walls[i].collider);
}

var tick = 0;

function main() {
	curTime = performance.now();
	dt = (curTime - prevTime) / 1000;
	prevTime = curTime;
	dt = (1000 / 60) / 1000;
	dt = 1;

	var playerMovementDir = 0;
	var playerTurnAmnt = 0;
	var playerMoving = true;
	var playerSpeed = 1;

	if (keysDown["shift"] == true) {
		playerSpeed = 0.5;
	}

	if (keysDown["w"] == true) {
		playerMovementDir++;
	}

	if (keysDown["s"] == true) {
		playerMovementDir--;
	}

	if (keysDown["a"] == true) {
		playerTurnAmnt -= 4 * degToRad * playerSpeed;
	}

	if (keysDown["d"] == true) {
		playerTurnAmnt += 4 * degToRad * playerSpeed;
	}

	if (playerMovementDir === 0) {
		playerMoving = false;
	}

	player.update(playerMoving, playerSpeed, playerTurnAmnt, playerMovementDir);

	for (var i = 0; i < walls.length; i++) {
		if (walls[i].collider.class === "b-wall") {
			if (walls[i].health <= 0) {
				phyEngine.removeObject(walls[i].collider);
				walls.splice(i, 1);
				i--;
				continue;
			}
		}

		walls[i].update();
	}

	phyEngine.update(dt);

	for (var i = 0; i < phyEngine.collisionsListAll.length; i++) {
		var colD = phyEngine.collisionsListAll[i];

		if (colD.objA.class === "p-bullet") {
			if (colD.objB.class === "u-wall") {
				colD.objA.parent.health = 0;
			} else if (colD.objB.class === "b-wall") {
				colD.objA.parent.health -= (dt * 45) / phyEngine.substeps;
				colD.objB.parent.health -= (dt * 45) / phyEngine.substeps;
			}
		} else if (colD.objB.class === "p-bullet") {
			if (colD.objA.class === "u-wall") {
				colD.objB.parent.health = 0;
			} else if (colD.objA.class === "b-wall") {
				colD.objB.parent.health -= (dt * 45) / phyEngine.substeps;
				colD.objA.parent.health -= (dt * 45) / phyEngine.substeps;
			}
		}
	}

	camera.position = lerpVec2(camera.position, player.position, 0.05);
	// camera.rotation = lerpAngleDegrees(camera.rotation, player.rotation * radToDeg + 90, 0.1);
	// camera.viewScale = 32 / Math.max(player.width, player.height);

	ctx.save();
	ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.clearRect(0, 0, vWidth, vHeight);
	ctx.fillStyle = "#808080";
	ctx.fillRect(0, 0, vWidth, vHeight);
	camera.applyToCtx(ctx, vWidth, vHeight);

	var gradient01 = ctx.createRadialGradient(0, 0, 10, 0, 0, 1024);
	gradient01.addColorStop(0, "#303030");
	gradient01.addColorStop(1, "#202020");
	ctx.fillStyle = gradient01;
	ctx.fillRect(-1024, -1024, 2048, 2048);
	drawGrid(ctx, -1024, -1024, 2048, 2048, 32, { strokeStyle: "#707070", lineWidth: 1 });

	player.draw(ctx);

	for (var i = 0; i < walls.length; i++) {
		walls[i].draw(ctx);
	}

	ctx.restore();

	mouse.velocity.x = 0;
	mouse.velocity.y = 0;
	mouse.previous.x = mouse.position.x;
	mouse.previous.y = mouse.position.y;

	tick++;
	// requestAnimationFrame(main);
}

window.addEventListener("load", () => {
	prevTime = performance.now();
	// player.setWeapons("garbageTank");
	updateIdx = setInterval(main, 1000 / tFps);
	// requestAnimationFrame(main);
});

window.addEventListener("resize", resizeCanvas);

window.addEventListener("wheel", (e) => {
	if (e.deltaY < 0) {
		camera.viewScale /= 0.96;
	} else {
		camera.viewScale *= 0.96;
	}
});

window.addEventListener("keydown", (e) => {
	keysDown[e.key.toLowerCase()] = true;
	// e.preventDefault();
});

window.addEventListener("keyup", (e) => {
	keysDown[e.key.toLowerCase()] = false;

});

window.addEventListener("contextmenu", (e) => {
	e.preventDefault();
});

window.addEventListener("mousedown", (e) => {
	if (e.button === 0) {
		mouse.down = true;
	}

	if (e.button === 2) {
		mouse.rightdown = true;
	}

	var mpx = mouse.position.x;
	var mpy = mouse.position.y;
	var mousePos = camera.applyToMouse(vWidth, vHeight, e.clientX, e.clientY);
	mouse.position.x = mousePos.x;
	mouse.position.y = mousePos.y;
	mouse.previous.x = mpx;
	mouse.previous.y = mpy;
});

window.addEventListener("mousemove", (e) => {
	var mpx = mouse.position.x;
	var mpy = mouse.position.y;
	var mousePos = camera.applyToMouse(vWidth, vHeight, e.clientX, e.clientY);
	mouse.position.x = mousePos.x;
	mouse.position.y = mousePos.y;
	mouse.velocity.x = mouse.position.x - mpx;
	mouse.velocity.y = mouse.position.y - mpy;
	mouse.previous.x = mpx;
	mouse.previous.y = mpy;

	player.tGunAngle = Math.atan2(mouse.position.y - player.position.y, mouse.position.x - player.position.x);
});

window.addEventListener("mouseup", () => {
	mouse.down = false;
	mouse.rightdown = false;
});