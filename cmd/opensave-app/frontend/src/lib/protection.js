// What protects traffic with one paired device, and how to say it.
//
// Kept out of the component so it can be tested. The wording matters as much
// as the logic here: this is the text that tells someone whether the saves
// they sync over the internet are readable by whoever else holds their room
// code, and a badge that overstates the protection is worse than no badge,
// because it converts a missing safeguard into a false assurance.
//
// The fields come from the peers API; see PeerProtection in
// internal/p2p/payloadseal.go. The condition for "encrypted" is deliberately
// the same one the send path applies, so the two cannot drift apart.

/**
 * @param {object} peer A peer entry from the peers payload.
 * @returns {'sealed'|'pending'|'open'|'direct'}
 */
export function protectionState(peer) {
  // Fall back to the address when the daemon predates these fields, so an
  // older build shows the neutral local-connection wording rather than
  // claiming a relay pairing is encrypted.
  const overRelay = peer?.overRelay ?? peer?.address === 'relay';
  if (!overRelay) return 'direct';
  if (peer?.encrypted) return 'sealed';
  return peer?.hasKey ? 'pending' : 'open';
}

export const PROTECTION_LABELS = {
  sealed: '已加密',
  pending: '即将加密',
  open: '未加密',
  direct: '直接连接',
};

export const PROTECTION_ICONS = {
  sealed: '🔒',
  pending: '🔐',
  open: '🔓',
  direct: '🖧',
};

export const PROTECTION_DETAILS = {
  sealed:
    '发送到这台设备的存档在你们两台设备之间加密。中继——以及任何持有你房间码的人——只会原样转发，无法读取内容。',
  pending:
    '密钥已就位。这台设备签入后就会开始加密，通常只需几秒钟。',
  open: '通过互联网发送到这台设备的存档，任何持有你房间码的人都能读取，包括中继的运营者。旧版本通过中继配对时没有保存加密密钥。解除配对后重新配对这两台设备即可修复。',
  direct:
    '这台设备通过你的本地网络直接连接，不经过任何中继。本地流量未加密，请对不可信的网络保持警惕。',
};

/**
 * Summarises the devices paired through a relay, for the room panel.
 * @param {object[]} peers Every paired peer.
 */
export function roomProtection(peers) {
  const relayPeers = (peers ?? []).filter((p) => protectionState(p) !== 'direct');
  const encrypted = relayPeers.filter((p) => protectionState(p) === 'sealed');
  // Only devices with no key are actionable: 'pending' resolves itself, and
  // telling someone to re-pair over a state that clears in seconds would send
  // them through an unpair for nothing.
  const unprotected = relayPeers.filter((p) => protectionState(p) === 'open');
  return { relayPeers, encrypted, unprotected };
}
