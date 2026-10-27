const NUMBER_OF_AGENTS = 30;
const PERSONAL_SPACE = 120;
const MAX_PUSH = 0.1;
const NEAR_MISS_DISTANCE = 70;

let agents = [];
let mousePerson;
let keyboardPerson;
let connection = 0;
let pairMidpoint;

function setup() {
  createCanvas(windowWidth, windowHeight);

  for (let i = 0; i < NUMBER_OF_AGENTS; i++) {
    agents.push(new Agent());
  }

  mousePerson = new Person("mouse", color(220, 120, 80));
  keyboardPerson = new Person("keyboard", color(90, 150, 180));
}

function draw() {
  background(245, 45);

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
    this.velocity = p5.Vector.random2D().mult(random(0.4, 1));
    this.noiseOffset = random(1000);
  }

  update() {
    const people = [mousePerson, keyboardPerson, ...agents];
    const distanceToPair = dist(
      this.position.x,
      this.position.y,
      pairMidpoint.x,
      pairMidpoint.y
    );
    const nearby = map(distanceToPair, 0, 220, 1, 0, true);
    const personalSpace = lerp(
      PERSONAL_SPACE,
      PERSONAL_SPACE * 0.65,
      connection * nearby
    );

    for (const person of people) {
      if (person === this) continue;

      const distance = dist(
        this.position.x,
        this.position.y,
        person.position.x,
        person.position.y
      );

      const personSpace = person instanceof Person ? personalSpace * 1.25 : personalSpace;
      if (distance < personSpace && distance > 0) {
        const away = p5.Vector.sub(this.position, person.position);
        const push = map(distance, 0, personSpace, MAX_PUSH, 0);
        away.setMag(push);
        this.velocity.add(away);
      }
    }

    // The noise wander is adapted from Shiffman's Nature of Code examples.
    const turn = map(noise(this.noiseOffset), 0, 1, -0.05, 0.05);
    this.velocity.rotate(turn);
    this.noiseOffset += 0.01;

    // This separation behaviour follows the steering approach described by
    // Reynolds (1987), with a small local pull added when connection grows.
    this.velocity.mult(1 - connection * nearby * 0.015);
    const towardPair = p5.Vector.sub(pairMidpoint, this.position);
    towardPair.setMag(connection * nearby * 0.012);
    this.velocity.add(towardPair);
    this.velocity.limit(1.3);
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
    fill(40);
    ellipse(this.position.x, this.position.y, 5, 5);
  }
}

class Person {
  constructor(type, colour) {
    this.type = type;
    this.colour = colour;
    this.position = createVector(width / 2, height / 2);
    this.velocity = createVector(0, 0);
  }

  update() {
    if (this.type === "mouse") {
      this.position.set(mouseX, mouseY);
      return;
    }

    if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) this.velocity.x = -2;
    else if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) this.velocity.x = 2;
    else this.velocity.x = 0;

    if (keyIsDown(UP_ARROW) || keyIsDown(87)) this.velocity.y = -2;
    else if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) this.velocity.y = 2;
    else this.velocity.y = 0;

    this.position.add(this.velocity);
    this.position.x = constrain(this.position.x, 0, width);
    this.position.y = constrain(this.position.y, 0, height);
  }

  show() {
    noStroke();
    fill(this.colour);
    ellipse(this.position.x, this.position.y, 9, 9);
  }
}

function mousePressed() {
  agents.push(new Agent(mouseX, mouseY));
}

function updateConnection() {
  const distance = dist(
    mousePerson.position.x,
    mousePerson.position.y,
    keyboardPerson.position.x,
    keyboardPerson.position.y
  );
  const mouseSpeed = dist(mouseX, mouseY, pmouseX, pmouseY);
  const keyboardSpeed = keyboardPerson.velocity.mag();
  const close = distance < 100;
  const still = mouseSpeed < 2 && keyboardSpeed < 0.15;

  if (close && still) connection += 0.004;
  else connection -= 0.01;

  connection = constrain(connection, 0, 1);
}

function drawNearMisses() {
  const people = [mousePerson, keyboardPerson, ...agents];

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const distance = p5.Vector.dist(
        people[i].position,
        people[j].position
      );

      if (distance < NEAR_MISS_DISTANCE) {
        const isVisitorPair =
          (people[i] === mousePerson && people[j] === keyboardPerson) ||
          (people[i] === keyboardPerson && people[j] === mousePerson);
        if (isVisitorPair && connection > 0) continue;

        const alpha = map(distance, 0, NEAR_MISS_DISTANCE, 90, 0);
        stroke(80, 80, 80, alpha);
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

  if (distance < 150 && connection > 0) {
    const alpha = map(distance, 0, 150, 150, 0) * connection;
    const lineColour = lerpColor(
      color(130, 160, 180),
      color(230, 150, 70),
      connection
    );
    lineColour.setAlpha(alpha);
    stroke(lineColour);
    strokeWeight(1 + connection);
    line(
      mousePerson.position.x,
      mousePerson.position.y,
      keyboardPerson.position.x,
      keyboardPerson.position.y
    );
  }

  if (connection > 0) {
    const glowColour = lerpColor(
      color(170, 190, 205),
      color(240, 170, 90),
      connection
    );
    noStroke();
    glowColour.setAlpha(25 * connection);
    fill(glowColour);
    ellipse(mousePerson.position.x, mousePerson.position.y, 15 + connection * 20);
    ellipse(keyboardPerson.position.x, keyboardPerson.position.y, 15 + connection * 20);
  }
}

function keyPressed() {
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
