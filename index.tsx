import lodashDebounce from 'lodash/debounce';
import lodashGet from 'lodash/get';
import lodashIsEqual from 'lodash/isEqual';
import lodashOmit from 'lodash/omit';
import lodashSet from 'lodash/set';
import React from 'react';

interface Xeate<T = any> {
  current: T;
  initial: T;
  changed: (() => boolean) | ((key: string) => boolean);
  run: (pluginNames: [string]) => Promise<any>;
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  debouncedSet: (key: string, value: any) => void;
  remove: (key: string) => void;
}

type XeatePlugin = (values: object) => any;
type XeatePlugins = { [pluginName: string]: XeatePlugin } | undefined;
type XeateConfig = {
  useStateFn?: <T>(
    initialState: T | (() => T)
  ) => [T, React.Dispatch<React.SetStateAction<T>>];
};

export function makeXeate<T>(config?: XeateConfig) {
  const context = React.createContext<Xeate<T> | undefined>(undefined);
  return {
    XeateProvider: makeXeateProvider<T>(context, config || {}),
    useXeate: makeUseXeate<T>(context),
  };
}

type XeateProviderProps = React.PropsWithChildren<{
  plugins?: XeatePlugins;
  initialValues: any;
}>;

function makeXeateProvider<T>(
  context: React.Context<Xeate<T> | undefined>,
  config: XeateConfig
) {
  const useStateFn = config.useStateFn || React.useState;

  return function XeateProvider({
    children,
    plugins,
    initialValues,
  }: XeateProviderProps) {
    const pluginsRef = React.useRef<XeatePlugins>(plugins);
    const initialValuesRef = React.useRef(initialValues);
    const updateCallbackRef = React.useRef<Function>(() => {});
    const [values, setValues] = useStateFn<T>(initialValuesRef.current);

    React.useEffect(() => {
      setTimeout(() => {
        updateCallbackRef.current(values);
        updateCallbackRef.current = () => {};
      }, 0);
    }, [values]);

    const run = React.useCallback(
      (pluginNames: Array<string>, updateState = true) => {
        return new Promise((resolve, reject) => {
          const plugins = pluginNames.map(
            (pluginName: string) =>
              pluginsRef.current?.[pluginName] as XeatePlugin
          );

          plugins.forEach((plugin) => {
            if (!plugin || typeof plugin !== 'function') {
              throw new Error(`XeatePlugin: '${plugin}' is not defined`);
            }
          });

          async function runPlugins() {
            let currentPluginIndex = 0;

            async function runNextPlugin(values: any) {
              const plugin = plugins[currentPluginIndex];
              return plugin(values);
            }

            return runNextPlugin(values).then((newValues) => {
              currentPluginIndex++;
              if (currentPluginIndex === plugins.length) {
                return newValues;
              } else {
                return runNextPlugin(newValues);
              }
            });
          }

          runPlugins().then(
            (updatedValues) => {
              if (updateState) {
                updateCallbackRef.current = resolve;
                setValues(updatedValues);
              } else {
                resolve(updatedValues);
              }
            },
            (error) => {
              reject(error);
            }
          );
        });
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [values]
    );

    const changed = React.useCallback(
      (key) => {
        if (key) {
          return lodashIsEqual(
            lodashGet(values, key),
            lodashGet(initialValuesRef.current, key)
          );
        }

        return lodashIsEqual(values, initialValuesRef.current);
      },
      [values]
    );

    const get = React.useCallback(
      (key) => {
        return lodashGet(values, key);
      },
      [values]
    );

    const set = React.useCallback((key, value) => {
      setValues((prev: any) => {
        const resolvedValue =
          typeof value === 'function' ? value(lodashGet(prev, key)) : value;
        return {
          ...lodashSet(prev, key, resolvedValue),
        };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSet = React.useCallback(
      lodashDebounce((key: string, value: any) => {
        set(key, value);
      }, 300),
      [set]
    );

    const remove = React.useCallback((key) => {
      setValues((prev: T) => {
        return { ...lodashOmit(prev as any, [key]) } as T;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = {
      initial: initialValuesRef.current,
      current: values,
      changed,
      run,
      get,
      set,
      remove,
      debouncedSet,
    };

    return <context.Provider value={value}>{children}</context.Provider>;
  };
}

function makeUseXeate<T>(context: React.Context<Xeate<T> | undefined>) {
  return function useXeate(): Xeate<T> {
    const context__ = React.useContext(context);
    if (!context__) {
      throw new Error('useXeate must be used within a XeateProvider');
    }
    return context__;
  };
}
