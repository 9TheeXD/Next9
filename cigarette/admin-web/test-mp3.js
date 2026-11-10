const fs = require('fs');
const lamejs = require('@breezystack/lamejs');

try {
  const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
  console.log("Encoder created successfully!");
} catch (e) {
  console.error("Error creating encoder:", e);
}
