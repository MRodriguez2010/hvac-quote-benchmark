import { examples, evaluate } from "./example.mjs";
for (const input of examples) {
  console.log(input.label, evaluate(input));
}
