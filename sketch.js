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

// Hand tracking — each detected hand drives one visitor dot.
// Left hand  → mousePerson  (orange dot)
// Right hand → keyboardPerson (blue dot)
// If only one hand is in frame the other falls back to mouse / keyboard.
let handPose;
let capture;
let trackedHands = []; // array of detected hand objects from ml5
let handTips = { orange: null, blue: null }; // fingertip positions on the canvas this frame
let devMode = false; // press P to see the camera and the tracked hands
let cameraStatus = "starting camera…";

function setup() {
  createCanvas(windowWidth, windowHeight);
  setScale();

  const floorArea = FLOOR_WIDTH_M * (height / metre);
  for (let i = 0; i < floor(floorArea * CROWD_DENSITY); i++) {
    agents.push(new Agent());
  }

  // The two visitors start apart, so they have to walk towards each other
  mousePerson = new Person("mouse", color(214, 105, 60), width * 0.35, height / 2);
  keyboardPerson = new Person("camera", color(70, 135, 170), width * 0.65, height / 2);

  startCamera();
}

function startCamera() {
  // The browser only allows the camera on https:// or http://localhost
  // (VS Code Live Server is fine; double-clicking index.html may not be).
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraStatus = "camera blocked: open via Live Server (http://127.0.0.1), not file://";
    return;
  }
  if (typeof ml5 === "undefined") {
    cameraStatus = "ml5 didn't load: check your internet connection";
    return;
  }

  // Mirrored, so moving your hand left moves the dot left
  capture = createCapture(
    { video: { width: 640, height: 480 }, audio: false },
    { flipped: true }
  );
  capture.size(640, 480);
  capture.hide();
  capture.elt.addEventListener("loadeddata", () => {
    cameraStatus = "camera on, loading hand model…";
  });

  // ml5 HandPose: up to 2 hands, 21 landmarks each
  handPose = ml5.handPose({ maxHands: 2, flipped: true }, () => {
    cameraStatus = "hand model starting…";
    handPose.detectStart(capture, onHands);
  });
}

// Called by ml5 each frame with all detected hands
function onHands(hands) {
  cameraStatus = "tracking"; // only set once the model is genuinely returning results
  trackedHands = hands || [];
}

function setScale() {
  metre = width / FLOOR_WIDTH_M;
  maxPush = 0.0012 * metre;
}

function draw() {
  assignHands();

  if (devMode) {
    // Still update the visitors so the piece keeps running underneath
    mousePerson.update();
    keyboardPerson.update();
    drawDevView();
    return;
  }

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
      // "mouse" is now driven by the LEFT hand if one is detected,
      // otherwise falls back to the actual mouse cursor.
      if (handTips.orange) {
        this.position.lerp(handTips.orange, 0.4);
      } else {
        this.position.set(mouseX, mouseY);
      }

    } else if (this.type === "camera") {
      // "camera" is driven by the RIGHT hand if one is detected,
      // otherwise falls back to arrow / WASD keys.
      if (handTips.blue) {
        this.position.lerp(handTips.blue, 0.4);
      } else {
        const step = (2 * metre) / 100;
        if (keyIsDown(LEFT_ARROW)  || keyIsDown(65)) this.velocity.x = -step;
        else if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) this.velocity.x = step;
        else this.velocity.x = 0;

        if (keyIsDown(UP_ARROW)   || keyIsDown(87)) this.velocity.y = -step;
        else if (keyIsDown(DOWN_ARROW)  || keyIsDown(83)) this.velocity.y = step;
        else this.velocity.y = 0;

        this.position.add(this.velocity);
        this.position.x = constrain(this.position.x, 0, width);
        this.position.y = constrain(this.position.y, 0, height);
      }
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

// Camera pixels → canvas pixels
function camToCanvas(x, y) {
  const vw = (capture && capture.elt.videoWidth) || 640;
  const vh = (capture && capture.elt.videoHeight) || 480;
  return createVector(map(x, 0, vw, 0, width), map(y, 0, vh, 0, height));
}

// Decide which hand drives which visitor this frame.
// Uses screen position rather than ml5's Left/Right label, which can flip:
// with two hands, the one further left is orange and the other is blue.
// With one hand, it drives the orange dot and blue goes back to the keys.
function assignHands() {
  handTips.orange = null;
  handTips.blue = null;

  // Index fingertip is keypoint 8
  const tips = trackedHands
    .filter((h) => h.keypoints && h.keypoints[8] && (h.confidence ?? 1) > 0.5)
    .map((h) => camToCanvas(h.keypoints[8].x, h.keypoints[8].y))
    .sort((a, b) => a.x - b.x);

  if (tips.length >= 1) handTips.orange = tips[0];
  if (tips.length >= 2) handTips.blue = tips[1];
}

// Developer view (press P): the camera feed with every tracked hand drawn on it,
// so you can see exactly what the model is picking up.
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [5, 9], [9, 10], [10, 11], [11, 12],   // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // pinky + palm
];

function drawDevView() {
  background(15);

  if (capture && capture.elt.readyState >= 2) {
    tint(255, 200);
    image(capture, 0, 0, width, height);
    noTint();
  }

  // Skeleton for every hand
  for (const hand of trackedHands) {
    if (!hand.keypoints) continue;
    const pts = hand.keypoints.map((k) => camToCanvas(k.x, k.y));
    stroke(255, 255, 255, 180);
    strokeWeight(2);
    for (const [a, b] of HAND_BONES) {
      if (pts[a] && pts[b]) line(pts[a].x, pts[a].y, pts[b].x, pts[b].y);
    }
    noStroke();
    fill(255);
    for (const p of pts) ellipse(p.x, p.y, 6);
  }

  // The fingertips actually driving the visitors, in their colours
  noFill();
  strokeWeight(3);
  if (handTips.orange) {
    stroke(mousePerson.colour);
    ellipse(handTips.orange.x, handTips.orange.y, 34);
  }
  if (handTips.blue) {
    stroke(keyboardPerson.colour);
    ellipse(handTips.blue.x, handTips.blue.y, 34);
  }

  // Readout
  noStroke();
  fill(0, 160);
  rect(12, 12, 360, 96, 4);
  fill(255);
  textFont("monospace");
  textSize(13);
  textAlign(LEFT, TOP);
  const labels = trackedHands
    .map((h) => `${h.handedness || "?"} ${round((h.confidence ?? 0) * 100)}%`)
    .join("   ");
  text(
    `DEV VIEW  (press P to go back)\n` +
      `status: ${cameraStatus}\n` +
      `hands: ${trackedHands.length ? labels : "none"}\n` +
      `connection: ${nf(connection, 1, 2)}`,
    22, 22
  );
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
  if (key === "p" || key === "P") devMode = !devMode;
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setScale();
}
