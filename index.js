const admin = require("firebase-admin");
const axios = require("axios");

// Gunakan environment variable SERVICE_ACCOUNT
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://disiplinku-28df5-default-rtdb.firebaseio.com",
});

const oneSignalAppId = "2e698604-60d3-4108-8c34-972420e9703a";
const oneSignalApiKey =
  "os_v2_app_fzuymbda2naqrdbus4scb2lqhjqztvsmegkue45oyjtkcz3txgq466qr" +
  "qqczxljudorp7ec2u3d2wmxonhyqjdw3klitkacpnck3gra";

async function sendNotification(title, body, imageUrl) {
  const message = {
    app_id: oneSignalAppId,
    included_segments: ["All"],
    contents: { en: body },
    headings: { en: title },
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
      },
    );
    console.log("Notifikasi dikirim:", response.data);
  } catch (error) {
    console.error(
      "Gagal mengirim notifikasi:",
      (error.response && error.response.data) || error.message,
    );
  }
}

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

process.on("SIGINT", () => {
  console.log("Menutup koneksi database...");
  admin.database().goOffline();
  process.exit();
});