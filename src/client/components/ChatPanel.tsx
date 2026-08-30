import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_CHAT_LENGTH, type ChatMessage } from '../../shared/types.js';
import type { ScribblySocket } from '../socket.js';

type ChatPanelProps = {
  socket: ScribblySocket;
  messages: ChatMessage[];
  canChat: boolean;
  guessed: boolean;
  isDrawer: boolean;
  onError: (message: string) => void;
};

export function ChatPanel({ socket, messages, canChat, guessed, isDrawer, onError }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim() || !canChat) return;
    const outgoing = message;
    setMessage('');
    socket.emit('chat:send', { message: outgoing }, (result) => {
      if (!result.ok) onError(result.error);
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendMessage();
  };

  let placeholder = 'Type a guess…';
  if (isDrawer) placeholder = 'You are drawing';
  else if (guessed) placeholder = 'You guessed it!';
  else if (!canChat) placeholder = 'Next turn soon';

  return (
    <section className="chat-panel" aria-label="Chat and guesses">
      <div className="panel-heading"><h2>Chat</h2><span>Guess here</span></div>
      <div className="chat-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">Wrong guesses appear here.</p>}
        {messages.map((item) => (
          <p className={`chat-line chat-line--${item.type}`} key={item.id}>
            {item.type === 'chat' && <strong>{item.nickname}: </strong>}
            {item.text}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="guess-input">Guess or message</label>
        <input
          id="guess-input"
          value={canChat ? message : ''}
          maxLength={MAX_CHAT_LENGTH}
          disabled={!canChat}
          placeholder={placeholder}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" disabled={!canChat || !message.trim()} aria-label="Send guess">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 5 17 7-17 7 3-7-3-7Zm3 7h14" /></svg>
        </button>
      </form>
    </section>
  );
}
