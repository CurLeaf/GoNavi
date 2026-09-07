import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const bridge = vi.hoisted(() => ({ capabilities: vi.fn(), models: vi.fn() }));
vi.mock('../../../wailsjs/go/aiservice/Service', () => ({ AIGetCLICapabilities: bridge.capabilities, AIGetCLIModelCatalog: bridge.models }));
vi.mock('@ant-design/icons', () => Object.fromEntries([
  'ApiOutlined', 'AppstoreOutlined', 'CheckOutlined', 'DeleteOutlined', 'EditOutlined', 'EyeInvisibleOutlined', 'EyeOutlined', 'KeyOutlined', 'LinkOutlined',
  'LoadingOutlined', 'PlusOutlined', 'RobotOutlined', 'SearchOutlined', 'CloudOutlined', 'ExperimentOutlined', 'ThunderboltOutlined', 'InfoCircleOutlined',
  'DownOutlined', 'RightOutlined', 'LeftOutlined', 'CloseOutlined', 'QuestionCircleOutlined',
].map((name) => [name, () => <i aria-hidden="true" />])));
vi.mock('antd', () => {
  const Input = Object.assign((props: any) => <input {...props} />, { Password: (props: any) => <input {...props} /> });
  const Form = Object.assign(({ children, ...props }: any) => <form {...props}>{children}</form>, {
    Item: ({ children, name, label, extra }: any) => <div data-field={name}>{label}{children}{extra}</div>,
    useWatch: (name: string, options: any) => (options.form || options).getFieldValue(name),
  });
  return {
    Form, Input,
    Select: React.forwardRef((props: any, ref: any) => <>
      <select ref={ref} {...props} />
      {typeof props.popupRender === 'function' ? props.popupRender(<div data-select-menu="true" />)
        : typeof props.dropdownRender === 'function' ? props.dropdownRender(<div data-select-menu="true" />) : null}
    </>),
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Space: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Tooltip: ({ children }: any) => <>{children}</>,
    Popconfirm: ({ children, ...props }: any) => <span data-popconfirm="true" {...props}>{children}</span>,
    Dropdown: Object.assign(({ children }: any) => <>{children}</>, {
      Button: ({ children, menu, ...props }: any) => <>
        <button {...props} data-dropdown-main="true">{children}</button>
        {(menu?.items || []).map((item: any) => (
          <button key={item.key} data-dropdown-item={item.key} disabled={item.disabled}
            onClick={() => menu.onClick?.({ key: item.key })}>{item.label}</button>
        ))}
      </>,
    }),
  };
});
import AISettingsProvidersSection, { REVEAL_ERROR_SELECTOR, revealFirstErrorIn } from './AISettingsProvidersSection';
import { findPreset, PROVIDER_PRESETS } from './aiSettingsModalConfig';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const presets = [
  { key: 'codex', fixedApiFormat: 'codex-cli', label: 'Codex Subscription', authMode: 'local-cli', backendType: 'custom', defaultBaseUrl: '', desc: '', icon: null },
  { key: 'grok', fixedApiFormat: 'grok-cli', label: 'Grok Subscription', authMode: 'local-cli', backendType: 'custom', defaultBaseUrl: '', desc: '', icon: null },
];
const capability = { apiFormat: 'grok-cli', command: 'grok', supportsModelDiscovery: true, supportsEffort: true, effortValues: ['low', 'high'], effortValuesVerified: true, defaultModel: 'configured-model', defaultEffort: 'high' };
const renderedText = (node: any): string => typeof node === 'string' ? node
  : Array.isArray(node) ? node.map(renderedText).join(' ') : renderedText(node?.children || []);
const elementText = (node: any): string => node === null || node === undefined || node === false || node === true ? ''
  : typeof node === 'string' || typeof node === 'number' ? String(node)
    : Array.isArray(node) ? node.map(elementText).join(' ') : elementText(node?.props?.children);

describe('provider settings mounted controls', () => {
  let renderer: ReactTestRenderer | undefined;
  let props: any;
  let values: Record<string, unknown>;
  let stored: Map<string, string>;
  const render = async (patch: Record<string, unknown> = {}) => {
    props = { ...props, ...patch };
    await act(async () => {
      if (renderer) renderer.update(<AISettingsProvidersSection {...props} />);
      else renderer = create(<AISettingsProvidersSection {...props} />);
    });
  };
  const modelPickers = () => renderer!.root.findAll((node) => node.type === 'select' && node.props.className === 'gonavi-ai-model-select');
  const cards = () => renderer!.root.findAll((node) => node.type === 'div' && /^gonavi-ai-provider-config-card(\s|$)/.test(String(node.props.className || '')));
  const presetSelect = () => renderer!.root.findAll((node) => node.type === 'select' && node.props.className === 'gonavi-ai-provider-preset-select')[0];
  const endpointSelector = () => renderer!.root.findAll((node) => node.type === 'select' && node.props.className === 'gonavi-ai-provider-endpoint-select')[0];
  const chooseEndpoint = async (endpoint: string) => { await act(async () => endpointSelector().props.onChange(endpoint)); };
  const connectionDetails = () => renderer!.root.findAllByProps({ className: 'gonavi-ai-cli-details' });
  const hintText = () => renderer!.root.findAll((node) => node.props?.title?.props?.className === 'gonavi-ai-provider-hint-body')
    .map((node) => elementText(node.props.title)).join(' ');
  beforeEach(() => {
    vi.resetAllMocks();
    stored = new Map();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => stored.set(key, value) } });
    bridge.capabilities.mockResolvedValue([capability]);
    bridge.models.mockResolvedValue({ models: ['discovered-model'], source: 'cli', stale: false });
    values = { model: 'typed-model', models: ['my-model'], effort: 'low' };
    props = {
      providers: [
        { id: 'b', name: 'Work alias', type: 'custom', apiFormat: 'codex-cli', authMode: 'local-cli', model: 'model-b' },
        { id: 'a', name: 'Personal alias', type: 'custom', apiFormat: 'grok-cli', authMode: 'local-cli', model: 'model-a' },
      ],
      activeProviderId: 'b', editingProvider: null, isEditing: false,
      form: { getFieldValue: vi.fn((key) => values[key]), setFieldValue: vi.fn(), setFieldsValue: vi.fn() },
      providerPresets: presets, watchedPresetKey: 'grok', watchedApiFormat: 'grok-cli',
      loading: false, testing: false, testStatus: 'idle', primaryPasswordVisible: false,
      darkMode: false, overlayTheme: buildOverlayWorkbenchTheme(false), cardBg: '#fff', cardBorder: '#ddd', inputBg: '#fff',
      onPrimaryPasswordVisibleChange: vi.fn(), resolveProviderPreset: (provider: any) => ({ key: provider.apiFormat === 'codex-cli' ? 'codex' : 'grok', label: provider.apiFormat === 'codex-cli' ? 'Codex Subscription' : 'Grok Subscription', icon: null }),
      resolvePresetByKey: (key: string) => presets.find((preset) => preset.key === key),
      onAddProvider: vi.fn(), onEditProvider: vi.fn(), onDeleteProvider: vi.fn(), onSetActiveProvider: vi.fn(), onCancelEdit: vi.fn(),
      onPresetChange: vi.fn(), onTestProvider: vi.fn(), onSaveProvider: vi.fn(), onValuesChange: vi.fn(), onCLIDefaults: vi.fn(),
    };
  });
  afterEach(async () => { await act(async () => { renderer?.unmount(); }); renderer = undefined; vi.unstubAllGlobals(); });

  it('scrolls only its own container and reports when there is no error', () => {
    const scrollTo = vi.fn();
    const container = {
      scrollTop: 40, clientHeight: 300, scrollTo,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ top: 520, height: 40 }) })),
    };
    expect(revealFirstErrorIn(container)).toBe(true);
    expect(container.querySelector).toHaveBeenCalledWith(REVEAL_ERROR_SELECTOR);
    expect(scrollTo).toHaveBeenCalledWith({ top: 330, behavior: 'smooth' });
    expect(revealFirstErrorIn({ ...container, querySelector: () => null })).toBe(false);
    expect(revealFirstErrorIn(null)).toBe(false);
    expect(REVEAL_ERROR_SELECTOR).toContain('.ant-form-item-has-error');
    expect(REVEAL_ERROR_SELECTOR).toContain('[role="alert"]');
  });

  it('never scrolls above the top of its container', () => {
    const scrollTo = vi.fn();
    revealFirstErrorIn({
      scrollTop: 0, clientHeight: 300, scrollTo,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelector: () => ({ getBoundingClientRect: () => ({ top: 110, height: 40 }) }),
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('renders configuration cards in list mode', async () => {
    await render();
    expect(cards()).toHaveLength(2);
    expect(renderedText(renderer!.toJSON())).toContain('AI configurations');
    expect(renderedText(renderer!.toJSON())).toContain('Add configuration');
    expect(renderer!.root.findAllByProps({ className: 'gonavi-ai-provider-chips' })).toHaveLength(0);
    expect(bridge.capabilities).not.toHaveBeenCalled();
  });

  it('deletes a saved configuration after confirming', async () => {
    await render();
    const remove = renderer!.root.findByProps({ 'aria-label': 'Delete: Personal alias' });
    const confirm = renderer!.root.findAll((node) => node.props?.['data-popconfirm'] === 'true')
      .find((node) => elementText(node.props.children).includes('Delete: Personal alias') || node.props.children?.props?.['aria-label'] === 'Delete: Personal alias')!;
    expect(confirm.props.title).toBe('Delete this provider?');
    await act(async () => confirm.props.onConfirm());
    expect(props.onDeleteProvider).toHaveBeenCalledWith('a');
  });

  it('opens the workspace view before adding from the connected tree node', async () => {
    const onOpenWorkspaceView = vi.fn();
    await render({ treeHostedView: 'connected', onOpenWorkspaceView });
    const add = renderer!.root.findAllByType('button').find((button) => renderedText(button).includes('Add configuration'))!;
    await act(async () => add.props.onClick());
    expect(onOpenWorkspaceView).toHaveBeenCalled();
    expect(props.onAddProvider).toHaveBeenCalled();
  });

  const apiPreset = { key: 'openai', label: 'OpenAI', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', desc: '', icon: null };
  const apiProvider = { id: 'c', name: 'Team key', type: 'openai', apiFormat: 'openai', model: 'gpt-4o' };

  it('offers save-as inside the apply dropdown for a multi-instance provider', async () => {
    await render({
      providerPresets: [...presets, apiPreset],
      providers: [...props.providers, apiProvider],
      resolveProviderPreset: (provider: any) => ({ key: provider.apiFormat === 'openai' ? 'openai' : 'grok', label: provider.apiFormat === 'openai' ? 'OpenAI' : 'Grok Subscription', icon: null }),
      isEditing: true, editingProvider: { ...apiProvider },
      watchedPresetKey: 'openai', watchedApiFormat: 'openai',
      onSaveProviderAsCopy: vi.fn(),
    });
    const main = renderer!.root.findByProps({ 'data-dropdown-main': 'true' });
    expect(renderedText(main.props.children)).toContain('Apply');
    const saveAs = renderer!.root.findByProps({ 'data-dropdown-item': 'save-as' });
    await act(async () => saveAs.props.onClick());
    expect(props.onSaveProviderAsCopy).toHaveBeenCalledTimes(1);
  });

  it('drops the save dropdown entirely for a singleton CLI preset', async () => {
    await render({ isEditing: true, editingProvider: { ...props.providers[1] }, onSaveProviderAsCopy: vi.fn() });
    expect(renderer!.root.findAllByProps({ 'data-dropdown-main': 'true' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ 'data-dropdown-item': 'save-as' })).toHaveLength(0);
  });

  it('renders an empty partner column in the provider dropdown', async () => {
    await render({ isEditing: true, editingProvider: { ...props.providers[1] } });
    expect(renderedText(renderer!.toJSON())).toContain('Built-in');
    expect(renderedText(renderer!.toJSON())).toContain('Featured sponsors');
    expect(renderedText(renderer!.toJSON())).toContain('No sponsors yet');
    expect(presetSelect().props.classNames.popup.root).toBe('gonavi-ai-provider-preset-dropdown');
    expect(presetSelect().props.popupMatchSelectWidth).toBe(false);
  });

  it('blocks a stale new CLI draft after another record has been added', async () => {
    await render({ isEditing: true, editingProvider: { id: '' } });
    expect(renderedText(renderer!.root.findByProps({ role: 'alert' }))).toContain('This CLI is already added');
  });

  it('keeps both API protocols selectable and invalidates checks when changing protocol', async () => {
    await render({
      isEditing: true, editingProvider: { id: 'saved' }, watchedPresetKey: 'deepseek', watchedApiFormat: 'openai-responses',
      providerPresets: [...presets, { key: 'deepseek', label: 'DeepSeek', backendType: 'openai', defaultBaseUrl: '', desc: '', icon: null }],
    });
    const protocol = endpointSelector();
    expect(protocol.props.options.map((item: any) => item.value)).toEqual(['openai-responses', 'openai']);
    await act(async () => protocol.props.onChange('openai'));
    expect(props.onPresetChange).toHaveBeenCalledWith('deepseek', 'openai');
  });

  it('leaves the test button label unchanged and renders the result next to it', async () => {
    await render({ isEditing: true, editingProvider: { id: 'a' }, loading: true, testStatus: 'success', testResult: { success: true, checkKind: 'local-auth', modelVerified: false, message: 'fixture' } });
    const buttons = renderer!.root.findAllByType('button');
    const check = buttons.find((button) => renderedText(button) === 'Test connection')!;
    const save = buttons.find((button) => renderedText(button) === 'Apply')!;
    expect(check.props.loading).toBe(false);
    expect(save.props.loading).toBe(true);
    await act(async () => { check.props.onClick(); save.props.onClick(); });
    expect(props.onTestProvider).toHaveBeenCalledOnce();
    expect(props.onSaveProvider).toHaveBeenCalledOnce();
  });

  it('cancels the editor from the back button', async () => {
    await render({ isEditing: true, editingProvider: { id: 'a' } });
    const back = renderer!.root.findAllByType('button').find((button) => renderedText(button).includes('Back'))!;
    await act(async () => back.props.onClick());
    expect(props.onCancelEdit).toHaveBeenCalled();
  });

  it('keeps configured CLI details collapsed while model and effort controls remain visible', async () => {
    await render({ isEditing: true, editingProvider: { id: 'a' } });
    expect(connectionDetails()).toHaveLength(0);
    expect(modelPickers()[0].props.options).toContainEqual({ label: 'discovered-model', value: 'discovered-model' });
    expect(renderer!.root.findAllByProps({ 'data-field': 'effort' })).toHaveLength(1);
    expect(props.onCLIDefaults).toHaveBeenCalledWith(capability);
  });

  it('keeps manual model input when model discovery fails', async () => {
    bridge.models.mockRejectedValue(new Error('not logged in'));
    await render({ isEditing: true, providers: [], editingProvider: { id: '' } });
    expect(modelPickers()[0].props.disabled).not.toBe(true);
    expect(hintText()).toContain('You can enter a model manually');
  });

  it('reuses the cached CLI catalog on entry and only refetches from the enabled count', async () => {
    stored.set('gonavi.ai.providers.modelCatalog.v1', JSON.stringify({ 'grok-cli': { catalog: { models: ['cached-grok'], source: 'cli', stale: false }, fetchedAt: 1 } }));
    await render({ isEditing: true, providers: [], editingProvider: { id: '' } });
    expect(bridge.models).not.toHaveBeenCalled();
    expect(modelPickers()[0].props.options).toContainEqual({ value: 'cached-grok', label: 'cached-grok' });
    const count = renderer!.root.findAll((node) => node.type === 'button' && node.props['aria-haspopup'] === 'dialog')[0];
    await act(async () => count.props.onClick({ preventDefault() {}, stopPropagation() {} }));
    expect(bridge.models).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the prior editor session defaults while fresh capabilities are loading', async () => {
    await render({ isEditing: true, providers: [], editingProvider: { id: '' }, editorSessionKey: 1 });
    expect(props.onCLIDefaults).toHaveBeenCalledTimes(1);
    const fresh = deferred<any[]>();
    bridge.capabilities.mockReturnValueOnce(fresh.promise);
    await render({ editorSessionKey: 2 });
    expect(props.onCLIDefaults).toHaveBeenCalledTimes(1);
    await act(async () => { fresh.resolve([{ ...capability, defaultModel: 'fresh-model' }]); });
    expect(props.onCLIDefaults).toHaveBeenLastCalledWith(expect.objectContaining({ defaultModel: 'fresh-model' }));
  });

  it('backfills a saved protocol and limits regional URL choices to that protocol', async () => {
    values.type = 'openai';
    values.baseUrl = 'https://api.minimaxi.com/v1';
    await render({ isEditing: true, editingProvider: { id: 'saved' }, watchedPresetKey: 'minimax', watchedApiFormat: 'openai', providerPresets: PROVIDER_PRESETS, resolvePresetByKey: findPreset });
    expect(endpointSelector().props.value).toBe('openai');
    const urls = renderer!.root.findByProps({ 'data-field': 'baseUrl' }).findByType('select');
    expect(urls.props.options.map((option: any) => option.value)).toEqual(['https://api.minimax.io/v1', 'https://api.minimaxi.com/v1']);
    await chooseEndpoint('anthropic');
    expect(props.onPresetChange).toHaveBeenCalledWith('minimax', 'anthropic');
  });
});
