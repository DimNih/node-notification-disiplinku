const admin = require("firebase-admin");
const axios = require("axios");

// Gunakan environment variable untuk service account jika ada, kalau tidak fallback ke file lokal
const serviceAccount = process.env.SERVICE_ACCOUNT 
  ? JSON.parse(process.env.SERVICE_ACCOUNT) 
  : require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://disiplinku-28df5-default-rtdb.firebaseio.com",
});

const oneSignalAppId = "2e698604-60d3-4108-8c34-972420e9703a";
const oneSignalApiKey =
  "os_v2_app_fzuymbda2naqrdbus4scb2lqhjqztvsmegkue45oyjtkcz3txgq466qr" +
  "qqczxljudorp7ec2u3d2wmxonhyqjdw3klitkacpnck3gra";

// Fungsi untuk mengirim notifikasi panggilan
async function sendCallNotificationToRecipient(recipientId, callerId, callerNameFromData, callType, callId) {
  try {
    console.log(`Fetching user data for recipient: ${recipientId}`);
    const recipientSnapshot = await admin.database()
      .ref(`user-name-admin/${recipientId}`)
      .once('value');
    
    const recipientData = recipientSnapshot.val();
    console.log(`Recipient data for ${recipientId}:`, recipientData);
    if (!recipientData?.oneSignalPlayerId) {
      console.log(`No OneSignal player ID found for user ${recipientId}`);
      return;
    }

    const playerId = recipientData.oneSignalPlayerId;

    console.log(`Fetching caller name for callerId: ${callerId}`);
    const callerSnapshot = await admin.database()
      .ref(`user-name-admin/${callerId}`)
      .once('value');
    const callerData = callerSnapshot.val();
    console.log(`Caller data for ${callerId}:`, callerData);
    const effectiveCallerName = callerData?.name && callerData.name.trim() !== "" 
      ? callerData.name 
      : (callerNameFromData && callerNameFromData.trim() !== "" ? callerNameFromData : "User");

    console.log(`Sending notification to playerId: ${playerId} with callerName: ${effectiveCallerName}`);

    const message = {
      app_id: oneSignalAppId,
      include_player_ids: [playerId],
      contents: { 
        en: `Panggilan ${callType} Dari ${effectiveCallerName}` 
      },
      headings: { 
        en: "Panggilan Masuk" 
      },
      data: {
        callType: callType,
        callId: callId,
        callerName: effectiveCallerName,
        recipientId: recipientId
      },
      ios_sound: "call.wav",
      android_sound: "call",
      priority: 10,
      android_vibrate: true,
      vibration_pattern: [0, 1000, 500, 1000],
      ios_badgeType: "Increase",
      ios_badgeCount: 1
    };

    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      message,
      {
        headers: {
          "Authorization": `Basic ${oneSignalApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    console.log(`Notification sent to ${recipientId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Failed to send call notification:",
      (error.response && error.response.data) || error.message
    );
    throw error;
  }
}

// Fungsi untuk mengirim notifikasi umum dengan suara
async function sendNotification(title, body, imageUrl) {
  const message = {
    app_id: oneSignalAppId,
    included_segments: ["All"],
    contents: { en: body },
    headings: { en: title },
    ios_sound: "default", // Suara default untuk iOS
    android_sound: "default", // Suara default untuk Android
  };

  if (imageUrl) {
    message.big_picture = imageUrl;
    message.ios_attachments = { image: imageUrl };
  }

  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      message,
      {
        headers: {
          "Authorization": `Basic ${oneSignalApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Notifikasi dikirim:", response.data);
  } catch (error) {
    console.error(
      "Gagal mengirim notifikasi:",
      (error.response && error.response.data) || error.message
    );
  }
}

// Listener untuk incoming calls
console.log("Node.js server started, listening to incomingCalls...");
const incomingCallsRef = admin.database().ref("incomingCalls");

incomingCallsRef.once("value", (snapshot) => {
  snapshot.forEach((recipientSnapshot) => {
    const recipientId = recipientSnapshot.key;
    console.log(`Setting up listener for recipient: ${recipientId}`);

    incomingCallsRef.child(recipientId).on("child_added", async (callSnapshot) => {
      const callData = callSnapshot.val();
      const callKey = callSnapshot.key;

      console.log(`Panggilan Masuk Dari: ${recipientId}:`, callData, "Key:", callKey);
      if (!callData || callData.processed) return;

      const { callerId, callerName, callType, callID } = callData;

      try {
        await sendCallNotificationToRecipient(
          recipientId,
          callerId,
          callerName,
          callType || "voice",
          callID
        );
        await incomingCallsRef.child(recipientId).child(callKey).update({ processed: true });
      } catch (error) {
        console.error(`Error processing incoming call for ${recipientId}:`, error);
      }
    });
  });
});

// Listener untuk notifikasi umum
const notificationsRef = admin.database().ref("/notifications");

notificationsRef.on("child_added", async (snapshot) => {
  const notificationData = snapshot.val();
  const notificationKey = snapshot.key;

  if (notificationData.sent) return;

  const name = notificationData.name || "Unknown";
  const date = notificationData.date || "No date";
  const imageUrl = notificationData.imageUrl || "";
  const title = `Post Baru dari ${name}`;
  const body = `Diposting pada ${date}`;

  console.log("Data baru di /notifications:", notificationData);

  await sendNotification(title, body, imageUrl);
  await notificationsRef.child(notificationKey).update({ sent: true });
});

// Handle shutdown
process.on("SIGINT", () => {
  console.log("Menutup koneksi database...");
  admin.database().goOffline();
  process.exit();
});
