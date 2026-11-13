package sg.edu.nus.foc.order.application.recovery;

/** Scoped guard bypass for ONLY the owning command; always cleaned up. */
public final class CommandScope implements AutoCloseable {
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();
    private final String previous;
    public CommandScope(String key) { previous = CURRENT.get(); CURRENT.set(key); }
    public static String current() { return CURRENT.get(); }
    @Override public void close() {
        if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
    }
}
