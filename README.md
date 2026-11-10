# HVAC Quote Benchmark

Two quotes for the same size heat pump can cover different work. This TypeScript module from the U1 Mechanical project compares a quoted system with a cost-book product, checks the scope, and decides whether the evidence supports a price comparison. The public example uses fictional equipment and prices.

| Example with a synthetic $8,000 quote | Result |
| --- | --- |
| Same three-ton heat pump and comparable scope | Above the illustrative $6,500–$7,500 range |
| Same equipment with additional ductwork | Staff review |
| Another product in the same system family | Planning reference only |

## Run the example

With Node.js 22 or newer, install the pinned compiler and run the demo and tests.

```sh
npm ci
npm run demo
npm test
```

The matching logic lives in `src/benchmark.ts`. It prefers an exact configured product, ranks same-system alternatives by available equipment characteristics, and checks whether the cost-book evidence supports a verdict. It keeps the reason alongside the result so a reviewer can see why a comparison was withheld.
