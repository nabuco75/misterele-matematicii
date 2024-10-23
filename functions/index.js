const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK
admin.initializeApp();

// Firestore trigger when a school document is deleted
exports.deleteStudentsOnSchoolDelete = functions.firestore.document("schools/{schoolId}").onDelete(async (snap, context) => {
  const schoolId = context.params.schoolId;
  const db = admin.firestore();

  try {
    // Query the 'registration' collection to find all students related to the deleted school
    const registrationQuerySnapshot = await db.collection("registration").where("school", "==", schoolId).get();

    const batch = db.batch();

    // Add each student record to a batch delete operation
    registrationQuerySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Commit the batch delete
    await batch.commit();
    functions.logger.info(`All students from school ${schoolId} have been deleted.`);
  } catch (error) {
    functions.logger.error(`Error deleting students for school ${schoolId}:`, error);
  }
});
