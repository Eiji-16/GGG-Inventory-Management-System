import React from 'react';
import { Sun, Moon } from 'lucide-react';
import './settings.css';

function Settings({ isDarkMode, onToggleTheme }) {
  return (
    <div className="s-container">
      <div className="s-card">
        <div className="s-row">
          <div className="s-row-info">
            <div className="s-row-icon">
              {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
            </div>
            <div>
              <div className="s-row-title">Appearance</div>
              <div className="s-row-desc">
                {isDarkMode ? 'Dark mode is on' : 'Light mode is on'}
              </div>
            </div>
          </div>

          <label className="s-switch">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={onToggleTheme}
              aria-label="Toggle dark mode"
            />
            <span className="s-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}

export default Settings;