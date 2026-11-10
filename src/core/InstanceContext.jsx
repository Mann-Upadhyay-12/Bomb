// Set by ModuleGroup around each copy of a "same manual" module (Password ×4 …).
// - grouped: the module hides its own manual editor (the group shows it once at the top)
// - report(answer): AnswerPanel tells the group this copy's answer, for the box summary
// - inject: { file, nonce } — a screenshot dropped on this copy's box, loaded by its Dropzone
import { createContext, useContext } from 'react';

export const InstanceContext = createContext(null);
export const useInstance = () => useContext(InstanceContext);
