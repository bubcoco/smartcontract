import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";

const ApolloModule = buildModule("Apollo", (m) => {
  const apollo = m.contract("Rocket", ["Saturn V"]);

  return { apollo };
});

it("should have named the rocket Saturn V", async function () {
  const connection = await hre.network.connect();
  const { apollo } = await connection.ignition.deploy(ApolloModule);

  assert.equal(await apollo.getFunction("name")(), "Saturn V");
});
