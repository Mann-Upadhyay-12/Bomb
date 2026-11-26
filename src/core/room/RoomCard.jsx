import React, { createContext, useContext, useMemo } from 'react';
import { useCardResets } from './roomCards.js';

/** Which module card a component is in ({ module, card }), or null outside one. AnswerPanel reports
 *  the card's answer for the room's answers board; useCardState shares what's typed or tapped in it. */
export const RoomCardContext = createContext(null);
export const useRoomCardId = () => useContext(RoomCardContext);

/** One module card. A teammate's CLEAR of this card starts it over (a fresh module), like New game does
 *  for every card. Outside a room the key never changes. */
export function RoomCard({ module, card, children }) {
  const resets = useCardResets(module, card);
  const id = useMemo(() => ({ module, card: Number(card) || 0 }), [module, card]);
  return (
    <RoomCardContext.Provider value={id}>
      <React.Fragment key={resets}>{children}</React.Fragment>
    </RoomCardContext.Provider>
  );
}
