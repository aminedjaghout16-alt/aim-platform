/* ============================================
   Storage Service — Firebase Storage stub
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.StorageService = {
  init() {
    console.log('[StorageService] Initialized — Firebase not configured');
  },

  async uploadFile(path, file) {
    // TODO: Replace with firebase.storage().ref(path).put(file)
    console.log('[StorageService] uploadFile stub:', path);
    return { path, url: `mock://${path}` };
  },

  async getDownloadURL(path) {
    // TODO: Replace with firebase.storage().ref(path).getDownloadURL()
    console.log('[StorageService] getDownloadURL stub:', path);
    return `mock://${path}`;
  },

  async deleteFile(path) {
    // TODO: Replace with firebase.storage().ref(path).delete()
    console.log('[StorageService] deleteFile stub:', path);
  },

  async uploadAvatar(userId, file) {
    return this.uploadFile(`avatars/${userId}/${file.name}`, file);
  },

  async getAvatarURL(userId) {
    return this.getDownloadURL(`avatars/${userId}/avatar.jpg`);
  },
};
