/**
 * src/components/livehelp/index.ts — barrel export
 *
 * Step 13b Phase 7: LiveHelpIndicator + HelpRequestModal REMOVED.
 * HS không còn chủ động gọi GV qua popup — dùng "Lớp hôm nay" tab khi có buổi.
 * LiveHelpModal + TeacherLiveHelpPane + ObserveModePane VẪN CÒN
 * (dùng bởi in-class observe flow + class-session claim).
 */

export { LiveHelpModal } from "./LiveHelpModal";
export { TeacherLiveHelpPane } from "./TeacherLiveHelpPane";
export { ObserveModePane } from "./ObserveModePane";
export { ObserveIncomingModal } from "./ObserveIncomingModal";
export { ObservePassiveView } from "./ObservePassiveView";
export { ObserveScreenView } from "./ObserveScreenView";
export { useLiveHelp } from "./hooks/useLiveHelp";