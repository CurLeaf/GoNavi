import React from 'react';

import { filterAISlashCommands, type AISlashCommandDefinition } from './aiSlashCommands';

interface UseAISlashCommandMenuParams {
  setInput: (val: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export const useAISlashCommandMenu = ({
  setInput,
  textareaRef,
}: UseAISlashCommandMenuParams) => {
  const [showSlashMenu, setShowSlashMenu] = React.useState(false);
  const [slashFilter, setSlashFilter] = React.useState('');

  const filteredSlashCmds = React.useMemo(
    () => filterAISlashCommands(slashFilter),
    [slashFilter],
  );

  const handleComposerInputChange = React.useCallback((value: string) => {
    setInput(value);
    if (value.startsWith('/')) {
      setSlashFilter(value.split(/\s/u)[0] || '/');
      setShowSlashMenu(true);
      return;
    }
    setShowSlashMenu(false);
    setSlashFilter('');
  }, [setInput]);

  const handleSelectSlashCommand = React.useCallback((command: AISlashCommandDefinition) => {
    setInput(command.prompt);
    setShowSlashMenu(false);
    setSlashFilter('');
    textareaRef.current?.focus();
  }, [setInput, textareaRef]);

  const handleOpenSlashMenu = React.useCallback(() => {
    setInput('/');
    setSlashFilter('/');
    setShowSlashMenu(true);
    textareaRef.current?.focus();
  }, [setInput, textareaRef]);

  const hideSlashMenu = React.useCallback(() => {
    setShowSlashMenu(false);
    setSlashFilter('');
  }, []);

  return {
    filteredSlashCmds,
    handleComposerInputChange,
    handleOpenSlashMenu,
    handleSelectSlashCommand,
    hideSlashMenu,
    showSlashMenu,
    slashFilter,
  };
};
