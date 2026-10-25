const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_123";
const BOB_UID = "bob_456";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

// --- SECURITY BOUNDS TESTS ---

test("Unauthenticated user: cannot read conversions", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).collection("conversions").get());
});

test("Authenticated user: Alice can create and read her own conversion", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const conversionRef = aliceDb.collection("users").doc(ALICE_UID).collection("conversions").doc("conv_1");

  await assertSucceeds(
    conversionRef.set({
      id: "conv_1",
      userId: ALICE_UID,
      rawInput: "12345678",
      formattedAmount: "1,23,45,678",
      wordsEnglish: "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Taka Only.",
      wordsBangla: "এক কোটি তেইশ লক্ষ পঁয়তাল্লিশ হাজার ছয় শত আটাত্তর টাকা মাত্র।",
      createdAt: new Date(),
    })
  );

  await assertSucceeds(conversionRef.get());
});

test("Authenticated user: Bob cannot read or write Alice's conversion", async () => {
  // Seed Alice data using security rules disabled
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(ALICE_UID).collection("conversions").doc("conv_1").set({
      id: "conv_1",
      userId: ALICE_UID,
      rawInput: "12345678",
      formattedAmount: "1,23,45,678",
      wordsEnglish: "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Taka Only.",
      wordsBangla: "এক কোটি তেইশ লক্ষ পঁয়তাল্লিশ হাজার ছয় শত আটাত্তর টাকা মাত্র।",
      createdAt: new Date(),
    });
  });

  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("conversions").doc("conv_1").get());

  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("conversions").doc("conv_2").set({
      id: "conv_2",
      userId: BOB_UID,
      rawInput: "500",
      formattedAmount: "500",
      wordsEnglish: "Five Hundred Taka Only.",
      wordsBangla: "পাঁচ শত টাকা মাত্র।",
      createdAt: new Date(),
    })
  );
});

test("Schema validation: Invalid fields are rejected", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const conversionRef = aliceDb.collection("users").doc(ALICE_UID).collection("conversions").doc("conv_bad");

  // Missing required field wordsBangla and has illegal extra field
  await assertFails(
    conversionRef.set({
      id: "conv_bad",
      userId: ALICE_UID,
      rawInput: "500",
      formattedAmount: "500",
      wordsEnglish: "Five Hundred Taka Only.",
      illegalField: "hacked",
      createdAt: new Date(),
    })
  );
});
