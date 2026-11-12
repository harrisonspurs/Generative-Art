# Generative Art

*Cities teach us to leave each other alone, and that same politeness is what makes it so rare and so powerful when two strangers stop.*

A p5.js prototype for a floor-projection piece about distance, avoidance, and connection in shared public space. A crowd is seen from above. Passers-by politely step around each other and around you. Standing still opens a clearing around you, because a stationary person in a flow gets a wider berth. Two people who stand still together connect, and the crowd nearby slows down and softens.

## Run it

Open `index.html` in a browser.

- Move the mouse to control the orange visitor.
- Use the arrow keys or W/A/S/D to control the blue visitor.
- Click to add another passer-by.

Try it in this order: let the crowd flow past; hold one visitor still and watch the clearing open; then bring both visitors together and stop.

## Scale

Everything is measured in metres and scaled by `FLOOR_WIDTH_M`, the real width of the projected floor. Change that one number to rescale the piece: a smaller value makes a tighter, more crowded space, a larger one a wider and emptier one. `CROWD_DENSITY` is people per square metre, so the crowd stays a crowd at any size.

The sketch is influenced by Erving Goffman's idea of civil inattention, Georg Simmel's writing on urban reserve, and Craig Reynolds' separation steering. The noise wander is adapted from Daniel Shiffman's *The Nature of Code*.
