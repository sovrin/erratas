// erratas' part of the nexitas shell: its name and icon, its panel on each project, and its
// section in the nav.
export default defineAppConfig({
  nexitas: {
    modules: [
      {
        id: 'erratas',
        label: 'Errors',
        description: 'What breaks in your apps, grouped into issues, with the stack trace.',
        icon: 'bug',
        panel: 'ErratasProject',
      },
    ],
    nav: [{ to: '/errors', label: 'Errors', module: 'erratas' }],
  },
})
