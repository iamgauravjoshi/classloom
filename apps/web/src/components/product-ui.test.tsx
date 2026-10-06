// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DetailList, LinkButton, PageHeader, StatusBadge } from "./product-ui";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

afterEach(cleanup);

describe("shared product patterns", () => {
  it("exposes page hierarchy and navigation with their correct semantics", () => {
    render(
      <PageHeader
        title="Students"
        description="School directory"
        breadcrumbs={[{ label: "People", href: "/dashboard" }]}
        actions={<LinkButton href="/students/new">Add student</LinkButton>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Students",
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add student" }).getAttribute("href"),
    ).toBe("/students/new");
    expect(screen.queryByRole("button", { name: "Add student" })).toBeNull();
  });

  it("preserves zero values and names status independently of its color", () => {
    render(
      <>
        <DetailList
          items={[
            { label: "Marks", value: 0 },
            { label: "Phone", value: null },
          ]}
        />
        <StatusBadge status="under_review" />
        <StatusBadge status={null} />
      </>,
    );
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Under review")).toBeTruthy();
    expect(screen.getByText("Not marked")).toBeTruthy();
  });

  it("associates a control with its guidance and server validation", () => {
    render(
      <Field data-invalid>
        <FieldLabel htmlFor="test-email">Email</FieldLabel>
        <Input id="test-email" />
        <FieldDescription>Use a school email address.</FieldDescription>
        <FieldError>Enter a valid email address.</FieldError>
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Use a school email address.",
      "Enter a valid email address.",
    ]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});
