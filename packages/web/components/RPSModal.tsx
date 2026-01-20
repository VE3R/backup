// RPSModal.tsx
import React, { useState } from 'react';
import { getSocket } from '../lib/socket'; // Go up one level

interface RPSModalProps {
  roomCode: string;
  challenge: any;
  playerId: string;
  challengerName: string;
  targetName: string;
  onClose: () => void;
}

export const RPSModal: React.FC<RPSModalProps> = ({
  roomCode,
  challenge,
  playerId,
  challengerName,
  targetName,
  onClose
}) => {
  const [choice, setChoice] = useState<'rock' | 'paper' | 'scissors' | null>(null);
  const isChallenger = playerId === challenge.challengerId;
  const isTarget = playerId === challenge.targetId;
  
  const handleChoice = (selected: 'rock' | 'paper' | 'scissors') => {
    if ((isChallenger && !challenge.challengerChoice) || (isTarget && !challenge.targetChoice)) {
      setChoice(selected);
      socket.emit('rps:choose', { 
        roomCode, 
        challengeId: challenge.id, 
        choice: selected 
      });
      onClose();
    }
  };
  
  const choices = [
    { id: 'rock', emoji: '✊', label: 'Rock' },
    { id: 'paper', emoji: '✋', label: 'Paper' },
    { id: 'scissors', emoji: '✌️', label: 'Scissors' }
  ];
  
  if (!isChallenger && !isTarget) {
    return (
      <div className="rps-modal spectator">
        <h2>Rock Paper Scissors!</h2>
        <p><strong>{challengerName}</strong> vs <strong>{targetName}</strong></p>
        <div className="rps-choices">
          {choices.map((c) => (
            <div key={c.id} className="rps-choice">
              <span className="rps-emoji">{c.emoji}</span>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
        <p>Waiting for choices...</p>
      </div>
    );
  }
  
  return (
    <div className="rps-modal">
      <h2>Rock Paper Scissors!</h2>
      <p>You're playing against {isChallenger ? targetName : challengerName}</p>
      <p className="rps-stakes">Loser drinks 2! 🍻🍻</p>
      <div className="rps-choices">
        {choices.map((c) => (
          <button
            key={c.id}
            onClick={() => handleChoice(c.id as 'rock' | 'paper' | 'scissors')}
            className={`rps-choice-btn ${choice === c.id ? 'selected' : ''}`}
            disabled={choice !== null}
          >
            <span className="rps-emoji-big">{c.emoji}</span>
            <span className="rps-label">{c.label}</span>
          </button>
        ))}
      </div>
      {choice && <p>You chose: {choice} - Waiting for opponent...</p>}
    </div>
  );
};