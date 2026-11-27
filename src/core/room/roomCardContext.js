// Which module card a component is in ({ module, card }), or null outside one (RoomCard.jsx provides
// it). A .js file of its own so the room's plain modules (useCardState.js) load in Node tests too.
import { createContext, useContext } from 'react';

export const RoomCardContext = createContext(null);
export const useRoomCardId = () => useContext(RoomCardContext);
