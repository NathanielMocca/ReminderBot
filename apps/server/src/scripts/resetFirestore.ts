import "dotenv/config";
import { getDb } from "../repositories/firestore.js";

const COLLECTIONS_TO_DELETE = ["reminders", "due_buckets", "dispatch_logs", "guilds"] as const;
const GLOBAL_LIMITS_DOC_PATH = "system_limits/global";

function hasYesFlag(): boolean {
  return process.argv.includes("--yes");
}

async function main(): Promise<void> {
  if (!hasYesFlag()) {
    console.error("Safety check failed: use --yes to confirm Firestore reset.");
    process.exit(1);
  }

  const db = getDb();
  console.log("Starting Firestore reset...");

  for (const collectionName of COLLECTIONS_TO_DELETE) {
    const collectionRef = db.collection(collectionName);
    console.log(`Deleting collection: ${collectionName}`);
    await db.recursiveDelete(collectionRef);
  }

  console.log(`Resetting document: ${GLOBAL_LIMITS_DOC_PATH}`);
  await db.doc(GLOBAL_LIMITS_DOC_PATH).set({
    freeReminderGlobalCap: 10000,
    freeReminderGlobalCount: 0,
    freeCreateLocked: false,
    lockReason: "",
    updatedAt: new Date().toISOString()
  }, { merge: true });

  console.log("Firestore reset completed.");
}

main().catch((error) => {
  console.error("Firestore reset failed:", error);
  process.exit(1);
});
