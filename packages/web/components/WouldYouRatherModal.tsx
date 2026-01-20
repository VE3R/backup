// WouldYouRatherModal.tsx
import React, { useState } from 'react';
import { getSocket } from '../lib/socket'; // Go up one level

interface WouldYouRatherModalProps {
  roomCode: string;
  question: string;
  optionA: string;
  optionB: string;
  playerId: string;
  initiatedBy: string;
  onClose: () => void;
}

export const WouldYouRatherModal: React.FC<WouldYouRatherModalProps> = ({
  roomCode,
  question,
  optionA,
  optionB,
  playerId,
  initiatedBy,
  onClose
}) => {
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  
  const handleVote = (option: 'A' | 'B') => {
    setSelected(option);
    socket.emit('would-you-rather:vote', { roomCode, option });
    onClose();
  };
  
  return (
    <div className="wyr-modal">
      <h2>Would You Rather</h2>
      <p className="initiated-by">Asked by: {initiatedBy}</p>
      <p className="wyr-question">{question}</p>
      <div className="wyr-options">
        <button 
          onClick={() => handleVote('A')} 
          className={`wyr-option ${selected === 'A' ? 'selected' : ''}`}
        >
          <div className="wyr-letter">A</div>
          <div className="wyr-text">{optionA}</div>
        </button>
        <div className="wyr-or">OR</div>
        <button 
          onClick={() => handleVote('B')} 
          className={`wyr-option ${selected === 'B' ? 'selected' : ''}`}
        >
          <div className="wyr-letter">B</div>
          <div className="wyr-text">{optionB}</div>
        </button>
      </div>
      <p className="wyr-instruction">Minority drinks 2! (If tie, everyone drinks 1)</p>
    </div>
  );
};