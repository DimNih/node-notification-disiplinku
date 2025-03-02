const admin = require("firebase-admin");
const axios = require("axios");

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

async function sendCallNotificationToRecipient(recipientId, callerId, callerNameFromData, callType, callId) {
  try {
    const recipientSnapshot = await admin.database().ref(`user-name-admin/${recipientId}`).once('value');
    const recipientData = recipientSnapshot.val();
    if (!recipientData?.oneSignalPlayerId) {
      console.log(`No OneSignal player ID found for user ${recipientId}`);
      return;
    }

    const playerId = recipientData.oneSignalPlayerId;
    const callerSnapshot = await admin.database().ref(`user-name-admin/${callerId}`).once('value');
    const callerData = callerSnapshot.val();
    const effectiveCallerName = callerData?.name && callerData.name.trim() !== "" 
      ? callerData.name 
      : (callerNameFromData && callerNameFromData.trim() !== "" ? callerNameFromData : "User");

    const message = {
      app_id: oneSignalAppId,
      include_player_ids: [playerId],
      contents: { en: `Panggilan ${callType} dari ${effectiveCallerName}` },
      headings: { en: "Jawab Dong..." },
      data: { callType, callId, callerName: effectiveCallerName, recipientId },
      ios_sound: "call.wav",
      android_sound: "call",
      priority: 10,
      android_vibrate: true,
      vibration_pattern: [0, 1000, 500, 1000],
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
      android_channel_id: "call_channel", // Channel khusus untuk panggilan
      buttons: [
        { id: "answer", text: "Answer", icon: "ic_menu_call" },
        { id: "decline", text: "Decline", icon: "ic_menu_close_clear_cancel" }
      ],
      large_icon: callerData?.profileImage || undefined // Foto profil pemanggil
    };

    const response = await axios.post("https://onesignal.com/api/v1/notifications", message, {
      headers: { "Authorization": `Basic ${oneSignalApiKey}`, "Content-Type": "application/json" },
    });
    console.log(`Notification sent to ${recipientId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error("Failed to send call notification:", (error.response && error.response.data) || error.message);
    throw error;
  }
}

async function sendNotification(title, body, imageUrl) {
  const message = {
    app_id: oneSignalAppId,
    included_segments: ["All"],
    contents: { en: body },
    headings: { en: title },
    ios_sound: "default",
    android_sound: "default",
    android_vibrate: true, // Tambah getar
    vibration_pattern: [0, 500, 250, 500],
    ios_badgeType: "Increase",
    ios_badgeCount: 1
  };

  if (imageUrl) {
    message.big_picture = imageUrl;
    message.ios_attachments = { image: imageUrl };
    message.large_icon = imageUrl; // Ikon besar dari gambar
  }

  try {
    const response = await axios.post("https://onesignal.com/api/v1/notifications", message, {
      headers: { "Authorization": `Basic ${oneSignalApiKey}`, "Content-Type": "application/json" },
    });
    console.log("Notifikasi dikirim:", response.data);
  } catch (error) {
    console.error("Gagal mengirim notifikasi:", (error.response && error.response.data) || error.message);
  }
}

console.log("Node.js server started, listening to incomingCalls...");
const incomingCallsRef = admin.database().ref("incomingCalls");

incomingCallsRef.once("value", (snapshot) => {
  snapshot.forEach((recipientSnapshot) => {
    const recipientId = recipientSnapshot.key;
    console.log(`Setting up listener for recipient: ${recipientId}`);
    incomingCallsRef.child(recipientId).on("child_added", async (callSnapshot) => {
      const callData = callSnapshot.val();
      const callKey = callSnapshot.key;
      if (!callData || callData.processed) return;

      const { callerId, callerName, callType, callID } = callData;
      try {
        await sendCallNotificationToRecipient(recipientId, callerId, callerName, callType || "voice", callID);
        await incomingCallsRef.child(recipientId).child(callKey).update({ processed: true });
      } catch (error) {
        console.error(`Error processing incoming call for ${recipientId}:`, error);
      }
    });
  });
});

const notificationsRef = admin.database().ref("/notifications");

notificationsRef.on("child_added", async (snapshot) => {
  const notificationData = snapshot.val();
  const notificationKey = snapshot.key;
  if (notificationData.sent) return;

  const name = notificationData.name || "Unknown";
  const date = notificationData.date || "No date";
  const imageUrl = notificationData.imageUrl || "";
  const title = `Postingan Baru Dari ${name}`;
  const body = `Diposting Pada ${date}`;

  await sendNotification(title, body, imageUrl);
  await notificationsRef.child(notificationKey).update({ sent: true });
});

process.on("SIGINT", () => {
  console.log("Menutup koneksi database...");
  admin.database().goOffline();
  process.exit();
});
