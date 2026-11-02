'use strict';

/**
 * Bounded, dependency-free LIVE state. Can be exercised with Node's built-in test runner.
 * All names and text sent to this module should be sanitized before display/speech.
 */
class LiveOps {
  constructor({ maxGuests = 120, maxScores = 1500, now = () => Date.now() } = {}) {
    this.maxGuests = maxGuests;
    this.maxScores = maxScores;
    this.now = now;
    this.guests = new Map();
    this.scores = new Map();
    this.greeted = new Map();
    this.lastActivity = now();
    this.totalLikes = 0;
    this.likeProgress = 0;
    this.rainUntil = 0;
  }

  touch() { this.lastActivity = this.now(); }

  join({ user, uniqueId, avatar }) {
    const key = String(uniqueId || user || '').slice(0, 70);
    if (!key) return false;
    const time = this.now();
    const previous = this.guests.get(key);
    if (previous) this.guests.delete(key);
    this.guests.set(key, { name: user, uniqueId: key, avatar: avatar || '', lastSeen: time });
    while (this.guests.size > this.maxGuests) this.guests.delete(this.guests.keys().next().value);
    this.touch();
    // Greet at most once per user in this server session, even when seat is recycled.
    if (this.greeted.has(key)) return false;
    this.greeted.set(key, time);
    while (this.greeted.size > 2500) this.greeted.delete(this.greeted.keys().next().value);
    return true;
  }

  addScore({ user, uniqueId, avatar, comments = 0, giftCoins = 0 }) {
    const key = String(uniqueId || user || '').slice(0, 70);
    if (!key) return;
    const previous = this.scores.get(key) || { name: user, uniqueId: key, avatar: '', comments: 0, giftCoins: 0, score: 0 };
    this.scores.delete(key);
    previous.name = user;
    if (avatar) previous.avatar = avatar;
    previous.comments += Math.max(0, Math.min(1, Math.floor(Number(comments) || 0)));
    previous.giftCoins += Math.max(0, Math.min(100000, Math.floor(Number(giftCoins) || 0)));
    previous.score = previous.comments + previous.giftCoins * 10;
    this.scores.set(key, previous);
    while (this.scores.size > this.maxScores) this.scores.delete(this.scores.keys().next().value);
    this.touch();
  }

  addLikes(count) {
    const n = Math.max(0, Math.min(2000, Math.floor(Number(count) || 0)));
    if (!n) return false;
    const before = Math.floor(this.likeProgress / 666);
    this.likeProgress += n;
    this.totalLikes += n;
    this.touch();
    if (Math.floor(this.likeProgress / 666) > before) {
      this.rainUntil = this.now() + 60000;
      this.likeProgress %= 666;
      return true;
    }
    this.likeProgress %= 666;
    return false;
  }

  getSummary() {
    return {
      totalLikes: this.totalLikes,
      heartsTowardsRain: this.likeProgress,
      nextRainAt: 666,
      rainUntil: this.rainUntil,
      guestCount: this.guests.size,
      lastActivity: this.lastActivity
    };
  }

  getGuests() {
    return [...this.guests.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  getTop(limit = 10) {
    return [...this.scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}

function blessingFromComment(text) {
  const t = String(text || '').toLowerCase().normalize('NFC');
  if (/thi cử|thi cu|học|hoc|đỗ|do dat|điểm/.test(t)) return 'Chúc bạn học tập tiến bộ và thi cử thuận lợi.';
  if (/sức khỏe|suc khoe|bệnh|benh|khỏi bệnh|khoi benh/.test(t)) return 'Chúc bạn và người thân nhiều sức khỏe, an yên.';
  if (/tình duyên|tinh duyen|tình yêu|tinh yeu|hôn nhân|hon nhan/.test(t)) return 'Chúc bạn có những mối quan hệ chân thành, vui vẻ.';
  if (/gia đình|gia dinh|cha mẹ|cha me|bố mẹ|bo me|con cái/.test(t)) return 'Chúc gia đình bạn bình an, yêu thương nhau.';
  if (/công việc|cong viec|việc làm|viec lam|kinh doanh/.test(t)) return 'Chúc công việc của bạn thuận lợi và nhiều niềm vui.';
  return 'Chúc bạn một ngày bình an và nhẹ nhàng.';
}

module.exports = { LiveOps, blessingFromComment };
