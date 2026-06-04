import { describe, expect, it } from 'vitest';

import { normalizeDriverProgressUpdate, type DriverProgressState } from './driverProgress';

describe('normalizeDriverProgressUpdate', () => {
  it('keeps downloading progress monotonic within one install session', () => {
    const previous: DriverProgressState = {
      status: 'downloading',
      message: '写入驱动元数据',
      percent: 90,
    };

    const actual = normalizeDriverProgressUpdate(previous, {
      status: 'downloading',
      message: '下载驱动总包',
      percent: 30,
    });

    expect(actual).toEqual({
      status: 'downloading',
      message: '下载驱动总包',
      percent: 90,
    });
  });

  it('allows start to reset progress for a new install session', () => {
    const actual = normalizeDriverProgressUpdate({
      status: 'error',
      message: '安装失败',
      percent: 90,
    }, {
      status: 'start',
      message: '开始安装',
      percent: 0,
    });

    expect(actual).toEqual({
      status: 'start',
      message: '开始安装',
      percent: 0,
    });
  });

  it('does not let stale downloading events overwrite terminal states', () => {
    const done = normalizeDriverProgressUpdate({
      status: 'downloading',
      message: '写入驱动元数据',
      percent: 95,
    }, {
      status: 'done',
      message: '驱动代理安装完成',
      percent: 100,
    });

    expect(normalizeDriverProgressUpdate(done, {
      status: 'downloading',
      message: '下载驱动总包',
      percent: 40,
    })).toBe(done);

    const failed = normalizeDriverProgressUpdate({
      status: 'downloading',
      message: '写入驱动元数据',
      percent: 95,
    }, {
      status: 'error',
      message: '安装失败',
      percent: 0,
    });

    expect(failed).toEqual({
      status: 'error',
      message: '安装失败',
      percent: 95,
    });
    expect(normalizeDriverProgressUpdate(failed, {
      status: 'downloading',
      message: '下载驱动总包',
      percent: 40,
    })).toBe(failed);
  });
});
