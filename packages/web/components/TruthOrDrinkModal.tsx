// TruthOrDrinkModal.tsx
import React, { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket'; // Go up one level

interface TruthOrDrinkModalProps {
  roomCode: string;
  session: any;
  playerId: string;
  onClose: () => void;
}

export const TruthOrDrinkModal: React.FC<TruthOrDrinkModalProps> = ({ 
  roomCode, 
  session, 
  playerId,
  onClose 
}) => {
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  
  useEffect(() => {
    if (session.timer) {
      const interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Auto drink if time runs out
            if (playerId === session.targetId) {
              socket.emit('truth:drink', { roomCode, sessionId: session.id });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [session.timer]);
  
  const handleAnswer = () => {
    if (answer.trim()) {
      socket.emit('truth:answer', { roomCode, sessionId: session.id, answer });
      onClose();
    }
  };
  
  const handleDrink = () => {
    socket.emit('truth:drink', { roomCode, sessionId: session.id });
    onClose();
  };
  
  if (playerId === session.targetId) {
    return (
      <div className="truth-modal">
        <h2>Truth or Drink! ⏱️ {timeLeft}s</h2>
        <p className="truth-question">{session.card.question}</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer..."
          rows={3}
        />
        <div className="truth-buttons">
          <button onClick={handleAnswer} className="btn-truth">
            🗣️ Answer Truthfully
          </button>
          <button onClick={handleDrink} className="btn-drink">
            🍻 Take 2 Drinks Instead
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="truth-modal spectator">
      <h2>Truth or Drink!</h2>
      <p><strong>{session.targetName}</strong> has been asked:</p>
      <p className="truth-question">"{session.card.question}"</p>
      <p>Waiting for their response... {timeLeft}s</p>
    </div>
  );
};