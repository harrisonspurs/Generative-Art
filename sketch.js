// A crowd seen from above, for a floor projection.
// Everything is measured in metres, so changing FLOOR_WIDTH_M rescales the
// whole piece to the real floor it is projected onto.

const FLOOR_WIDTH_M = 14; // how wide the projected floor is in real life
const CROWD_DENSITY = 0.4; // people per square metre (a busy pavement)

const BODY_M = 0.42; // shoulder width of a passer-by
const PERSONAL_SPACE_M = 1.2; // the room strangers give each other
const VISITOR_SPACE = 1.6; // real people are given more room than passers-by
const NEAR_MISS_M = 0.85; // closer than anyone meant to get: a missed encounter
const APPROACH_M = 3.5; // visitors sense each other at social distance (Hall)
const CONNECT_M = 1.2; // close enough for two still visitors to connect

let metre; // pixels per metre
let maxPush;
let agents = [];
let mousePerson;
let keyboardPerson;
let connection = 0;
let pairMidpoint;

function setup() {
  createCanvas(windowWidth, windowHeight);
  setScale();

  const floorArea = FLOOR_WIDTH_M * (height / metre);
  for (let i = 0; i < floor(floorArea * CROWD_DENSITY); i++) {
    agents.push(new Agent());
  }

  // The two visitors start apart, so they have to walk towards each other
  mousePerson = new Person("mouse", color(214, 105, 60), width * 0.35, height / 2);
  keyboardPerson = new Person("keyboard", color(70, 135, 170), width * 0.65, height / 2);
}

function setScale() {
  metre = width / FLOOR_WIDTH_M;
  maxPush = 0.0012 * metre;
}

function draw() {
  background(246, 244, 240, 80);

  mousePerson.update();
  keyboardPerson.update();
  updateConnection();
  pairMidpoint = p5.Vector.add(
    mousePerson.position,
    keyboardPerson.position
  ).div(2);

  for (const agent of agents) {
    agent.update();
    agent.show();
  }

  drawNearMisses();
  drawConnection();
  mousePerson.show();
  keyboardPerson.show();
}

class Agent {
  constructor(x = random(width), y = random(height)) {
    this.position = createVector(x, y);
    this.pace = random(0.7, 1.2); // metres per second: everyone walks differently
    this.velocity = p5.Vector.random2D().mult(this.toStep(this.pace));
    this.noiseOffset = random(1000);
    this.noiseSpeed = random(0.005, 0.012);
    this.politeness = random(0.85, 1.15); // some give more room than others
    this.size = random(BODY_M * 0.9, BODY_M * 1.15);
    this.grey = random(40, 70); // everyone looks slightly different
  }

  // Metres per second into pixels per frame
  toStep(metresPerSecond) {
    return (metresPerSecond * metre) / 60;
  }

  update() {
    const people = [mousePerson, keyboardPerson, ...agents];
    const distanceToPair = dist(
      this.position.x,
      this.position.y,
      pairMidpoint.x,
      pairMidpoint.y
    );
    // How close this passer-by is to a connection that is happening
    const nearby = map(distanceToPair, 0, 3.5 * metre, 1, 0, true);
    const warmth = connection * nearby;

    // Near a connection the crowd relaxes with each other, but the two
    // visitors keep their pocket: the connection softens the crowd rather
    // than drawing it in to watch.
    const personalSpace =
      lerp(PERSONAL_SPACE_M, PERSONAL_SPACE_M * 0.55, warmth) *
      this.politeness *
      metre;

    // Politeness: ease away from anyone inside that space, more strongly the
    // closer they are. This separation behaviour follows the steering
    // approach described by Reynolds (1987).
    for (const person of people) {
      if (person === this) continue;

      const distance = dist(
        this.position.x,
        this.position.y,
        person.position.x,
        person.position.y
      );

      // Someone standing still is treated as an obstacle in the flow: the
      // longer they stand, the wider the berth the crowd gives them.
      const personSpace =
        person instanceof Person
          ? PERSONAL_SPACE_M *
            VISITOR_SPACE *
            (1 + 0.7 * person.stillness) *
            this.politeness *
            metre
          : personalSpace;

      if (distance < personSpace && distance > 0) {
        const away = p5.Vector.sub(this.position, person.position);
        const push = map(distance, 0, personSpace, maxPush, 0);
        away.setMag(push);
        this.velocity.add(away);
      }
    }

    // The noise wander is adapted from Shiffman's Nature of Code examples.
    const turn = map(noise(this.noiseOffset), 0, 1, -0.05, 0.05);
    this.velocity.rotate(turn);
    this.noiseOffset += this.noiseSpeed;

    // Ease back towards a steady walking pace, so stepping aside changes
    // someone's direction rather than making them speed up. Near a connection
    // they slow down and linger.
    const pace = this.toStep(this.pace * (1 - warmth * 0.75));
    this.velocity.setMag(lerp(this.velocity.mag(), pace, 0.06));
    this.velocity.limit(this.toStep(1.8));
    this.position.add(this.velocity);
    this.wrap();
  }

  wrap() {
    if (this.position.x < 0) this.position.x = width;
    if (this.position.x > width) this.position.x = 0;
    if (this.position.y < 0) this.position.y = height;
    if (this.position.y > height) this.position.y = 0;
  }

  show() {
    noStroke();
    fill(this.grey);
    // A very slight size breath as they move: bodies in motion, not stamps.
    const breath = 1 + 0.08 * sin(this.noiseOffset * 8);
    ellipse(this.position.x, this.position.y, this.size * metre * breath);
  }
}

class Person {
  constructor(type, colour, x, y) {
    this.type = type;
    this.colour = colour;
    this.position = createVector(x, y);
    this.velocity = createVector(0, 0);
    this.speed = 0; // smoothed, so a slightly shaky hand still counts as still
    this.stillness = 0; // 0 to 1, how long they have been standing still
  }

  update() {
    const before = this.position.copy();

    if (this.type === "mouse") {
      this.position.set(mouseX, mouseY);
    } else {
      const step = (2 * metre) / 100;
      if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) this.velocity.x = -step;
      else if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) this.velocity.x = step;
      else this.velocity.x = 0;

      if (keyIsDown(UP_ARROW) || keyIsDown(87)) this.velocity.y = -step;
      else if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) this.velocity.y = step;
      else this.velocity.y = 0;

      this.position.add(this.velocity);
      this.position.x = constrain(this.position.x, 0, width);
      this.position.y = constrain(this.position.y, 0, height);
    }

    this.speed = lerp(this.speed, p5.Vector.dist(before, this.position), 0.12);
    // Standing still builds slowly and is lost as soon as you move
    this.stillness += this.isStill() ? 0.012 : -0.08;
    this.stillness = constrain(this.stillness, 0, 1);
  }

  isStill() {
    return this.speed < 0.015 * metre;
  }

  show() {
    noStroke();
    fill(this.colour);
    ellipse(this.position.x, this.position.y, 0.5 * metre);
  }
}

function mousePressed() {
  agents.push(new Agent(mouseX, mouseY));
}

// Connection only builds when two people are close AND both have stopped
function updateConnection() {
  const distance = dist(
    mousePerson.position.x,
    mousePerson.position.y,
    keyboardPerson.position.x,
    keyboardPerson.position.y
  );
  const close = distance < CONNECT_M * metre;
  const still = mousePerson.isStill() && keyboardPerson.isStill();

  if (close && still) connection += 0.005;
  else connection -= 0.01;

  connection = constrain(connection, 0, 1);
}

function drawNearMisses() {
  const people = [mousePerson, keyboardPerson, ...agents];

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const distance = p5.Vector.dist(people[i].position, people[j].position);

      const isVisitorPair =
        (people[i] === mousePerson && people[j] === keyboardPerson) ||
        (people[i] === keyboardPerson && people[j] === mousePerson);
      // The visitor pair has its own approach line, so skip near-misses
      // between them once they are within sensing range.
      if (isVisitorPair && distance < APPROACH_M * metre) continue;

      // Near-misses involving a real person are drawn more strongly, and more
      // strongly again when that person is standing still, so a visitor can
      // see the crowd reacting to them.
      const visitor =
        people[i] instanceof Person
          ? people[i]
          : people[j] instanceof Person
          ? people[j]
          : null;
      const limit = (visitor ? NEAR_MISS_M * 1.5 : NEAR_MISS_M) * metre;

      if (distance < limit) {
        const strength = visitor ? 150 : 70;
        stroke(80, 80, 80, map(distance, 0, limit, strength, 0));
        strokeWeight(1);
        line(
          people[i].position.x,
          people[i].position.y,
          people[j].position.x,
          people[j].position.y
        );
      }
    }
  }
}

function drawConnection() {
  const distance = dist(
    mousePerson.position.x,
    mousePerson.position.y,
    keyboardPerson.position.x,
    keyboardPerson.position.y
  );

  // Approach line: appears at social distance (3.5m), fades from cool to warm
  // as the visitors walk toward each other.  No stillness needed — the line
  // is the invitation to stop.
  if (distance < APPROACH_M * metre) {
    const closeness = map(distance, APPROACH_M * metre, 0, 0, 1);
    const alpha = map(closeness, 0, 1, 10, 160);
    const lineColour = lerpColor(
      color(130, 160, 180), // cool grey-blue: two strangers noticing
      color(230, 150, 70),  // warm orange: something forming
      closeness
    );
    lineColour.setAlpha(alpha);
    stroke(lineColour);
    strokeWeight(0.5 + closeness * 2);
    line(
      mousePerson.position.x,
      mousePerson.position.y,
      keyboardPerson.position.x,
      keyboardPerson.position.y
    );
  }

  // Rings only appear once the connection has built up (close + still + time).
  // This is the payoff: the moment two strangers have actually stopped together.
  if (connection > 0.2) {
    const ringStrength = map(connection, 0.2, 1, 0, 1, true);
    const glowColour = lerpColor(
      color(170, 190, 205),
      color(240, 170, 90),
      connection
    );
    noStroke();
    glowColour.setAlpha(25 * ringStrength);
    fill(glowColour);
    const size = (0.5 + ringStrength * 0.8) * metre;
    ellipse(mousePerson.position.x, mousePerson.position.y, size);
    ellipse(keyboardPerson.position.x, keyboardPerson.position.y, size);
  }
}

function keyPressed() {
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setScale();
}
