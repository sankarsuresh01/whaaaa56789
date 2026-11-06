// Hearth settings. Fill these in during setup (see SETUP.md, step 4).
// This file is public on GitHub, so put nothing secret here.
// The Client ID and folder ID are safe to share: nobody can use them
// without being one of your two approved Google accounts.
window.HEARTH_CONFIG = {
  // From Google Cloud > Clients. Looks like 1234-abcd.apps.googleusercontent.com
  CLIENT_ID: "PASTE_YOUR_CLIENT_ID_HERE",

  // From your Drive folder's address: drive.google.com/drive/folders/<THIS PART>
  FOLDER_ID: "PASTE_YOUR_FOLDER_ID_HERE",

  // What the app calls each of you. Nicknames are fine. Leave "" to use
  // the first name on each Google account.
  YOUR_NICKNAME: "",
  HER_NICKNAME: "",

  // Clocks
  YOUR_PLACE: "Berlin",
  YOUR_TIMEZONE: "Europe/Berlin",
  HER_PLACE: "India",
  HER_TIMEZONE: "Asia/Kolkata"
};
